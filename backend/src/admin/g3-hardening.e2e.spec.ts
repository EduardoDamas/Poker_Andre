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
 * STEP G3 gate — abuse protection (OTP rate limit) + audit trail of admin actions.
 */
describe('G3 hardening (e2e)', () => {
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

  async function makeUser(role: 'PLAYER' | 'ADMIN'): Promise<{ id: string; token: string; phone: string }> {
    counter += 1;
    const phone = `+5511911100${counter.toString().padStart(3, '0')}`;
    const user = await prisma.user.create({
      data: {
        phone,
        displayName: role,
        cpf: `1110000000${counter.toString().padStart(2, '0')}`,
        birthDate: new Date('1990-01-01'),
        role,
      },
    });
    const token = await jwt.signAsync({ sub: user.id, phone });
    return { id: user.id, token, phone };
  }

  it('throttles rapid OTP requests (429 after the limit)', async () => {
    const phone = '+5511900112233';
    // 5 are allowed within the window...
    for (let i = 0; i < 5; i++) {
      await request(server()).post('/auth/otp/request').send({ phone }).expect(200);
    }
    // ...the 6th is rejected.
    await request(server()).post('/auth/otp/request').send({ phone }).expect(429);
  });

  it('rate limit is per-phone (a different number is unaffected)', async () => {
    const phoneA = '+5511900112244';
    const phoneB = '+5511900112255';
    for (let i = 0; i < 5; i++) {
      await request(server()).post('/auth/otp/request').send({ phone: phoneA }).expect(200);
    }
    await request(server()).post('/auth/otp/request').send({ phone: phoneA }).expect(429);
    // Different phone still works.
    await request(server()).post('/auth/otp/request').send({ phone: phoneB }).expect(200);
  });

  it('writes an audit record when an admin approves a withdrawal', async () => {
    const admin = await makeUser('ADMIN');
    const player = await makeUser('PLAYER');
    await wallet.deposit(player.id, 5000n);
    const wd = await withdrawals.request(player.id, 3000n, 'p@pix.com');

    await request(server())
      .post(`/admin/withdrawals/${wd.id}/approve`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ adminNote: 'ok' })
      .expect(201);

    const logs = await prisma.auditLog.findMany({ where: { action: 'withdrawal.approve' } });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      actorId: admin.id,
      targetType: 'withdrawal',
      targetId: wd.id,
    });
    expect((logs[0].metadata as any).amountCents).toBe('3000');
  });

  it('writes an audit record on reject too', async () => {
    const admin = await makeUser('ADMIN');
    const player = await makeUser('PLAYER');
    await wallet.deposit(player.id, 5000n);
    const wd = await withdrawals.request(player.id, 3000n, 'p@pix.com');

    await request(server())
      .post(`/admin/withdrawals/${wd.id}/reject`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({})
      .expect(201);

    const logs = await prisma.auditLog.findMany({ where: { action: 'withdrawal.reject' } });
    expect(logs).toHaveLength(1);
    expect(logs[0].actorId).toBe(admin.id);
  });
});
