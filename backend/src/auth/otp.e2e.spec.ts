import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../app.module';
import { DevOtpProvider } from './otp/otp-provider';
import { resetDb } from '../test-utils/reset-db';

/**
 * STEP B4 gate — phone OTP login + JWT (e2e).
 */
describe('Auth OTP login (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let otpProvider: DevOtpProvider;
  let jwt: JwtService;

  const phone = '+5511990001234';
  const registered = {
    phone,
    displayName: 'Eduardo',
    cpf: '111.444.777-35',
    birthDate: '1990-01-01',
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = new PrismaClient();
    otpProvider = app.get(DevOtpProvider);
    jwt = app.get(JwtService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await request(app.getHttpServer()).post('/auth/register').send(registered).expect(201);
  });

  const server = () => app.getHttpServer();

  it('request returns 200 and a code is generated', async () => {
    await request(server()).post('/auth/otp/request').send({ phone }).expect(200);
    expect(otpProvider.lastCodeFor(phone)).toMatch(/^\d{6}$/);
    expect(await prisma.otpCode.count({ where: { phone } })).toBe(1);
  });

  it('verify with the correct code returns a valid JWT and activates the user', async () => {
    await request(server()).post('/auth/otp/request').send({ phone }).expect(200);
    const code = otpProvider.lastCodeFor(phone)!;

    const res = await request(server())
      .post('/auth/otp/verify')
      .send({ phone, code })
      .expect(200);

    expect(res.body.accessToken).toBeDefined();
    const payload = jwt.verify(res.body.accessToken);
    expect(payload.phone).toBe(phone);
    expect(res.body.user.status).toBe('ACTIVE');

    const user = await prisma.user.findUniqueOrThrow({ where: { phone } });
    expect(user.status).toBe('ACTIVE');
    expect(payload.sub).toBe(user.id);
  });

  it('verify with a wrong code returns 401', async () => {
    await request(server()).post('/auth/otp/request').send({ phone }).expect(200);
    const real = otpProvider.lastCodeFor(phone)!;
    const wrong = real === '000000' ? '111111' : '000000';
    await request(server()).post('/auth/otp/verify').send({ phone, code: wrong }).expect(401);
  });

  it('verify with an expired code returns 401', async () => {
    await request(server()).post('/auth/otp/request').send({ phone }).expect(200);
    const code = otpProvider.lastCodeFor(phone)!;
    // Force expiry.
    await prisma.otpCode.updateMany({
      where: { phone },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await request(server()).post('/auth/otp/verify').send({ phone, code }).expect(401);
  });

  it('a code is single-use (cannot be replayed)', async () => {
    await request(server()).post('/auth/otp/request').send({ phone }).expect(200);
    const code = otpProvider.lastCodeFor(phone)!;
    await request(server()).post('/auth/otp/verify').send({ phone, code }).expect(200);
    await request(server()).post('/auth/otp/verify').send({ phone, code }).expect(401);
  });

  it('verify for an unregistered phone returns 401', async () => {
    const other = '+5511999998888';
    await request(server()).post('/auth/otp/request').send({ phone: other }).expect(200);
    const code = otpProvider.lastCodeFor(other)!;
    await request(server())
      .post('/auth/otp/verify')
      .send({ phone: other, code })
      .expect(401);
  });

  it('malformed verify payloads return 400', async () => {
    await request(server()).post('/auth/otp/verify').send({ phone }).expect(400); // no code
    await request(server())
      .post('/auth/otp/verify')
      .send({ phone, code: '12' }) // too short
      .expect(400);
  });
});
