import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../app.module';
import { WalletService } from '../wallet/wallet.service';
import { WithdrawalService } from '../wallet/withdrawal.service';
import { LedgerService } from '../wallet/ledger.service';
import { resetDb } from '../test-utils/reset-db';

/**
 * STEP E2 gate — admin approves / rejects withdrawals (manual Pix), with the
 * ledger reflecting the action and money staying conserved.
 */
describe('Admin withdrawal settlement (e2e)', () => {
  let app: INestApplication;
  let jwt: JwtService;
  let wallet: WalletService;
  let withdrawals: WithdrawalService;
  let ledger: LedgerService;
  let prisma: PrismaClient;
  let counter = 0;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    jwt = app.get(JwtService);
    wallet = app.get(WalletService);
    withdrawals = app.get(WithdrawalService);
    ledger = app.get(LedgerService);
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    await resetDb(prisma);
  });

  const server = () => app.getHttpServer();

  async function makeUser(role: 'PLAYER' | 'ADMIN'): Promise<{ id: string; token: string }> {
    counter += 1;
    const user = await prisma.user.create({
      data: {
        phone: `+5511988800${counter.toString().padStart(3, '0')}`,
        displayName: role,
        cpf: `8800000000${counter.toString().padStart(2, '0')}`,
        birthDate: new Date('1990-01-01'),
        role,
      },
    });
    const token = await jwt.signAsync({ sub: user.id, phone: user.phone });
    return { id: user.id, token };
  }

  it('admin approves a withdrawal: status PAID, money leaves, ledger conserved', async () => {
    const admin = await makeUser('ADMIN');
    const player = await makeUser('PLAYER');
    await wallet.deposit(player.id, 5000n);
    const wd = await withdrawals.request(player.id, 3000n, 'p@pix.com'); // balance now 2000

    const res = await request(server())
      .post(`/admin/withdrawals/${wd.id}/approve`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ adminNote: 'paid via bank app' })
      .expect(201);

    expect(res.body).toMatchObject({ status: 'PAID', amountCents: '3000' });
    // Player keeps the reduced balance; whole ledger nets to zero.
    expect(await wallet.getBalance(player.id)).toBe(2000n);
    const agg = await prisma.ledgerEntry.aggregate({ _sum: { amountCents: true } });
    expect(agg._sum.amountCents).toBe(0n);
  });

  it('admin rejects a withdrawal: funds returned to the player', async () => {
    const admin = await makeUser('ADMIN');
    const player = await makeUser('PLAYER');
    await wallet.deposit(player.id, 5000n);
    const wd = await withdrawals.request(player.id, 3000n, 'p@pix.com');

    const res = await request(server())
      .post(`/admin/withdrawals/${wd.id}/reject`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ adminNote: 'invalid Pix key' })
      .expect(201);

    expect(res.body.status).toBe('REJECTED');
    expect(await wallet.getBalance(player.id)).toBe(5000n); // fully restored
  });

  it('cannot settle an already-settled withdrawal', async () => {
    const admin = await makeUser('ADMIN');
    const player = await makeUser('PLAYER');
    await wallet.deposit(player.id, 5000n);
    const wd = await withdrawals.request(player.id, 3000n, 'p@pix.com');
    await withdrawals.approve(wd.id);

    await request(server())
      .post(`/admin/withdrawals/${wd.id}/approve`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({})
      .expect(400);
  });

  it('forbids a non-admin from approving (403) and leaves the withdrawal pending', async () => {
    const player = await makeUser('PLAYER');
    await wallet.deposit(player.id, 5000n);
    const wd = await withdrawals.request(player.id, 3000n, 'p@pix.com');

    await request(server())
      .post(`/admin/withdrawals/${wd.id}/approve`)
      .set('Authorization', `Bearer ${player.token}`)
      .send({})
      .expect(403);

    const still = await prisma.withdrawal.findUniqueOrThrow({ where: { id: wd.id } });
    expect(still.status).toBe('REQUESTED');
  });
});
