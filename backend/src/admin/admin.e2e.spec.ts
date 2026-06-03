import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../app.module';
import { WalletService } from '../wallet/wallet.service';
import { WithdrawalService } from '../wallet/withdrawal.service';
import { resetDb } from '../test-utils/reset-db';

/**
 * STEP E1 gate — admin read views, protected by the ADMIN role.
 */
describe('Admin API (e2e)', () => {
  let app: INestApplication;
  let jwt: JwtService;
  let wallet: WalletService;
  let withdrawals: WithdrawalService;
  let prisma: PrismaClient;
  let counter = 0;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    jwt = app.get(JwtService);
    wallet = app.get(WalletService);
    withdrawals = app.get(WithdrawalService);
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
        phone: `+5511977700${counter.toString().padStart(3, '0')}`,
        displayName: role === 'ADMIN' ? 'Admin' : `Player${counter}`,
        cpf: `7700000000${counter.toString().padStart(2, '0')}`,
        birthDate: new Date('1990-01-01'),
        role,
      },
    });
    const token = await jwt.signAsync({ sub: user.id, phone: user.phone });
    return { id: user.id, token };
  }

  it('lets an admin list players with balances', async () => {
    const admin = await makeUser('ADMIN');
    const player = await makeUser('PLAYER');
    await wallet.deposit(player.id, 2500n);

    const res = await request(server())
      .get('/admin/players')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);

    const found = res.body.find((p: any) => p.id === player.id);
    expect(found).toBeTruthy();
    expect(found.balanceCents).toBe('2500'); // string, not BigInt
    expect(found.status).toBeDefined();
  });

  it('lets an admin list pending withdrawals', async () => {
    const admin = await makeUser('ADMIN');
    const player = await makeUser('PLAYER');
    await wallet.deposit(player.id, 5000n);
    await withdrawals.request(player.id, 3000n, 'player@pix.com');

    const res = await request(server())
      .get('/admin/withdrawals?status=REQUESTED')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      userId: player.id,
      amountCents: '3000',
      status: 'REQUESTED',
      pixKey: 'player@pix.com',
    });
  });

  it('forbids a non-admin (403)', async () => {
    const player = await makeUser('PLAYER');
    await request(server())
      .get('/admin/withdrawals')
      .set('Authorization', `Bearer ${player.token}`)
      .expect(403);
  });

  it('rejects an unauthenticated request (401)', async () => {
    await request(server()).get('/admin/players').expect(401);
  });
});
