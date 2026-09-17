import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../app.module';
import { DevOtpProvider } from './otp/otp-provider';
import { resetDb } from '../test-utils/reset-db';

/**
 * "Esqueci minha senha" — a code to the player's phone sets a new password.
 * The code channel is whatever OTP_PROVIDER is configured to (dev logger here).
 */
describe('Password reset (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let otpProvider: DevOtpProvider;

  const phone = '+5511990007777';
  const registered = {
    phone,
    displayName: 'Eduardo',
    cpf: '111.444.777-35',
    birthDate: '1990-01-01',
    password: 'senha-antiga',
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
    prisma = new PrismaClient();
    otpProvider = app.get(DevOtpProvider);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await request(app.getHttpServer()).post('/auth/register').send(registered).expect(201);
  });

  const http = () => request(app.getHttpServer());

  async function codeFor(target = phone): Promise<string> {
    await http().post('/auth/password/forgot').send({ phone: target }).expect(200);
    const code = otpProvider.lastCodeFor(target);
    expect(code).toBeDefined();
    return code!;
  }

  it('a code from "esqueci minha senha" sets a new password and logs in', async () => {
    const code = await codeFor();

    const reset = await http()
      .post('/auth/password/reset')
      .send({ phone, code, password: 'senha-nova-123' })
      .expect(200);
    expect(reset.body.accessToken).toBeTruthy();
    expect(reset.body.user.phone).toBe(phone);

    await http().post('/auth/login').send({ phone, password: 'senha-nova-123' }).expect(200);
    await http().post('/auth/login').send({ phone, password: 'senha-antiga' }).expect(401);
  });

  it('the new session works against a protected endpoint', async () => {
    const code = await codeFor();
    const reset = await http()
      .post('/auth/password/reset')
      .send({ phone, code, password: 'senha-nova-123' })
      .expect(200);

    const me = await http()
      .get('/auth/me')
      .set('Authorization', `Bearer ${reset.body.accessToken}`)
      .expect(200);
    expect(me.body.phone).toBe(phone);
  });

  it('an unknown number answers the same, and sends nothing', async () => {
    const stranger = '+5511990009999';
    const res = await http().post('/auth/password/forgot').send({ phone: stranger }).expect(200);
    expect(res.body.message).toMatch(/Se o número estiver cadastrado/);
    expect(otpProvider.lastCodeFor(stranger)).toBeUndefined();
  });

  it('a wrong code does not change the password', async () => {
    await codeFor();
    await http()
      .post('/auth/password/reset')
      .send({ phone, code: '000000', password: 'nao-vale' })
      .expect(401);

    await http().post('/auth/login').send({ phone, password: 'senha-antiga' }).expect(200);
  });

  it('a code is single-use', async () => {
    const code = await codeFor();
    await http().post('/auth/password/reset').send({ phone, code, password: 'senha-nova-1' }).expect(200);
    await http().post('/auth/password/reset').send({ phone, code, password: 'senha-nova-2' }).expect(401);
    await http().post('/auth/login').send({ phone, password: 'senha-nova-1' }).expect(200);
  });

  it('a blocked account gets no code', async () => {
    // A fresh number: the dev provider remembers codes for the whole run, so a
    // reused phone could show one left over from an earlier test.
    const blockedPhone = '+5511990008888';
    await http()
      .post('/auth/register')
      .send({ ...registered, phone: blockedPhone, cpf: '529.982.247-25' })
      .expect(201);
    await prisma.user.update({
      where: { phone: blockedPhone },
      data: { status: 'BLOCKED', blockReason: 'fraude' },
    });

    await http().post('/auth/password/forgot').send({ phone: blockedPhone }).expect(200);
    expect(otpProvider.lastCodeFor(blockedPhone)).toBeUndefined();
  });

  it('rejects a short password', async () => {
    const code = await codeFor();
    await http().post('/auth/password/reset').send({ phone, code, password: '123' }).expect(400);
  });

  it('rate-limits repeated requests for the same number', async () => {
    // Fresh number: the limiter's window is in-memory and per phone, so earlier
    // tests would have eaten part of this one's allowance.
    const spammed = '+5511990006666';
    await http()
      .post('/auth/register')
      .send({ ...registered, phone: spammed, cpf: '123.456.789-09' })
      .expect(201);

    for (let i = 0; i < 5; i++) {
      await http().post('/auth/password/forgot').send({ phone: spammed }).expect(200);
    }
    await http().post('/auth/password/forgot').send({ phone: spammed }).expect(429);
  });
});
