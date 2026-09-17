import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../app.module';
import { resetDb } from '../test-utils/reset-db';
import { LEGAL_VERSION } from './legal-version';

/**
 * STEP B3 gate — POST /auth/register (e2e against the test DB).
 */
describe('POST /auth/register (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const valid = {
    phone: '+5511990001234',
    displayName: 'Eduardo',
    cpf: '111.444.777-35', // valid CPF
    birthDate: '1990-01-01', // adult
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
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

  it('registers a valid player (201) and creates a wallet account', async () => {
    const res = await request(server()).post('/auth/register').send(valid).expect(201);
    expect(res.body).toMatchObject({
      phone: valid.phone,
      displayName: 'Eduardo',
      status: 'PENDING',
    });
    expect(res.body.id).toBeDefined();
    expect(res.body.cpf).toBeUndefined(); // CPF not leaked in the response

    const account = await prisma.account.findUnique({ where: { userId: res.body.id } });
    expect(account?.type).toBe('PLAYER');
  });

  it('stores the CPF normalised (digits only)', async () => {
    const res = await request(server()).post('/auth/register').send(valid).expect(201);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(user.cpf).toBe('11144477735');
  });

  it('rejects an invalid CPF (400)', async () => {
    await request(server())
      .post('/auth/register')
      .send({ ...valid, cpf: '111.444.777-00' })
      .expect(400);
  });

  it('rejects an under-18 applicant (400)', async () => {
    await request(server())
      .post('/auth/register')
      .send({ ...valid, birthDate: '2015-01-01' })
      .expect(400);
  });

  it('rejects a duplicate phone (409)', async () => {
    await request(server()).post('/auth/register').send(valid).expect(201);
    await request(server())
      .post('/auth/register')
      .send({ ...valid, cpf: '529.982.247-25' }) // different valid CPF, same phone
      .expect(409);
  });

  it('rejects a duplicate CPF (409)', async () => {
    await request(server()).post('/auth/register').send(valid).expect(201);
    await request(server())
      .post('/auth/register')
      .send({ ...valid, phone: '+5511990009999' }) // different phone, same CPF
      .expect(409);
  });

  it('rejects malformed payloads (400)', async () => {
    await request(server()).post('/auth/register').send({}).expect(400);
    await request(server())
      .post('/auth/register')
      .send({ ...valid, phone: 'not-a-phone' })
      .expect(400);
    await request(server())
      .post('/auth/register')
      .send({ ...valid, extraField: 'x' }) // forbidNonWhitelisted
      .expect(400);
  });

  describe('terms acceptance', () => {
    const base = {
      displayName: 'Consentido',
      cpf: '529.982.247-25',
      birthDate: '1990-01-01',
      password: 'senha-123',
    };

    it('records when and which version the player accepted', async () => {
      const phone = '+5511955500001';
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ ...base, phone, acceptedTerms: true })
        .expect(201);

      const user = await prisma.user.findUnique({ where: { phone } });
      expect(user?.termsVersion).toBe(LEGAL_VERSION);
      expect(user?.termsAcceptedAt).toBeInstanceOf(Date);
      expect(Date.now() - user!.termsAcceptedAt!.getTime()).toBeLessThan(60_000);
    });

    it('records nothing when the app did not ask (older builds still register)', async () => {
      const phone = '+5511955500002';
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ ...base, phone, cpf: '111.444.777-35' })
        .expect(201);

      const user = await prisma.user.findUnique({ where: { phone } });
      expect(user?.termsAcceptedAt).toBeNull();
      expect(user?.termsVersion).toBeNull();
    });

    it('never fakes consent from acceptedTerms: false', async () => {
      const phone = '+5511955500003';
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ ...base, phone, cpf: '123.456.789-09', acceptedTerms: false })
        .expect(201);

      const user = await prisma.user.findUnique({ where: { phone } });
      expect(user?.termsAcceptedAt).toBeNull();
    });

    it('rejects a non-boolean acceptedTerms', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ ...base, phone: '+5511955500004', cpf: '693.318.160-04', acceptedTerms: 'sim' })
        .expect(400);
    });
  });
});
