import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../app.module';
import { resetDb } from '../test-utils/reset-db';

/**
 * STEP F2 (backend) gate — GET /tables lobby catalog.
 */
describe('GET /tables (e2e)', () => {
  let app: INestApplication;
  let jwt: JwtService;
  let prisma: PrismaClient;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    jwt = app.get(JwtService);
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

  it('requires authentication (401)', async () => {
    await request(server()).get('/tables').expect(401);
  });

  it('returns the 7 Poker rooms with entry fees and seat info', async () => {
    const user = await prisma.user.create({
      data: {
        phone: '+5511900000123',
        displayName: 'Player',
        cpf: '11144477735',
        birthDate: new Date('1990-01-01'),
      },
    });
    const token = await jwt.signAsync({ sub: user.id, phone: user.phone });

    const res = await request(server())
      .get('/tables')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toHaveLength(7);
    expect(res.body[0]).toMatchObject({
      id: 'poker-l1',
      name: 'Poker — Nível 1',
      level: 1,
      entryCents: 2000,
      maxSeats: 8,
      players: 0,
    });
    // Levels ascend; entry fees strictly increase.
    const levels = res.body.map((t: any) => t.level);
    expect(levels).toEqual([1, 2, 3, 4, 5, 6, 7]);
    const fees = res.body.map((t: any) => t.entryCents);
    expect([...fees].sort((a: number, b: number) => a - b)).toEqual(fees);
  });
});
