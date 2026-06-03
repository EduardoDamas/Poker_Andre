import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../app.module';
import { DevOtpProvider } from './otp/otp-provider';
import { resetDb } from '../test-utils/reset-db';

/**
 * STEP B5 gate — JwtAuthGuard protecting GET /auth/me.
 */
describe('JwtAuthGuard (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let otpProvider: DevOtpProvider;

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
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  const server = () => app.getHttpServer();

  // Register + log in, returning a valid JWT.
  async function login(): Promise<string> {
    await request(server()).post('/auth/register').send(registered).expect(201);
    await request(server()).post('/auth/otp/request').send({ phone }).expect(200);
    const code = otpProvider.lastCodeFor(phone)!;
    const res = await request(server())
      .post('/auth/otp/verify')
      .send({ phone, code })
      .expect(200);
    return res.body.accessToken;
  }

  beforeEach(async () => {
    await resetDb(prisma);
  });

  it('rejects a request with no token (401)', async () => {
    await request(server()).get('/auth/me').expect(401);
  });

  it('rejects a malformed Authorization header (401)', async () => {
    await request(server()).get('/auth/me').set('Authorization', 'Token abc').expect(401);
    await request(server()).get('/auth/me').set('Authorization', 'Bearer').expect(401);
  });

  it('rejects an invalid/garbage token (401)', async () => {
    await request(server())
      .get('/auth/me')
      .set('Authorization', 'Bearer not.a.jwt')
      .expect(401);
  });

  it('allows a request with a valid token (200) and returns the user', async () => {
    const token = await login();
    const res = await request(server())
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.phone).toBe(phone);
    expect(res.body.status).toBe('ACTIVE');
    expect(res.body.id).toBeDefined();
  });
});
