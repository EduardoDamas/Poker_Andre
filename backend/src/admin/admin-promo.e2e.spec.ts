import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../app.module';
import { PromoService } from '../promo/promo.service';
import { resetDb } from '../test-utils/reset-db';

/**
 * The panel's Promoções tab: schedule the client's promotion (minimum 80,
 * 100 places, tolerance or none), follow it, see who won, call it off.
 */
describe('Admin promotions API (e2e)', () => {
  let app: INestApplication;
  let jwt: JwtService;
  let promo: PromoService;
  let prisma: PrismaClient;
  let counter = 0;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    jwt = app.get(JwtService);
    promo = app.get(PromoService);
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await prisma.promoEvent.deleteMany();
    await prisma.tournamentWin.deleteMany();
  });

  const server = () => app.getHttpServer();

  async function makeUser(role: 'PLAYER' | 'ADMIN', displayName = `P${counter + 1}`) {
    counter += 1;
    const user = await prisma.user.create({
      data: {
        phone: `+5511966600${counter.toString().padStart(3, '0')}`,
        displayName,
        cpf: `6600000000${counter.toString().padStart(2, '0')}`,
        birthDate: new Date('1990-01-01'),
        status: 'ACTIVE',
        role,
      },
    });
    return { id: user.id, token: await jwt.signAsync({ sub: user.id, phone: user.phone }) };
  }

  const nivel0 = {
    name: 'Nível 0',
    startsAt: '2026-10-07T23:00:00.000Z',
    prizeCents: 25000,
    prizeSubscriberCents: 50000,
    minPlayers: 80,
    maxPlayers: 100,
    waitMinutes: 30,
  };

  it('an admin schedules the promotion and sees it listed', async () => {
    const admin = await makeUser('ADMIN');
    const created = await request(server())
      .post('/admin/promo-events')
      .set('Authorization', `Bearer ${admin.token}`)
      .send(nivel0)
      .expect(201);
    expect(created.body).toMatchObject({
      name: 'Nível 0', prizeCents: '25000', prizeSubscriberCents: '50000',
      minPlayers: 80, maxPlayers: 100, waitMinutes: 30, status: 'SCHEDULED', live: null,
    });

    const list = await request(server()).get('/admin/promo-events').set('Authorization', `Bearer ${admin.token}`).expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].id).toBe(created.body.id);
  });

  it('"sem tolerância" is stored as null: it waits for the minimum', async () => {
    const admin = await makeUser('ADMIN');
    const res = await request(server())
      .post('/admin/promo-events')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ ...nivel0, waitMinutes: null })
      .expect(201);
    expect(res.body.waitMinutes).toBeNull();
  });

  it('refuses places a single final table cannot hold', async () => {
    const admin = await makeUser('ADMIN');
    const res = await request(server())
      .post('/admin/promo-events')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ ...nivel0, maxPlayers: 120 })
      .expect(400);
    expect(JSON.stringify(res.body.message)).toMatch(/maxPlayers/);
  });

  it('shows who won, by name, and what was paid', async () => {
    const admin = await makeUser('ADMIN');
    const winner = await makeUser('PLAYER', 'Campeã da Silva');
    const e = await promo.createEvent({
      name: 'Nível 0', startsAt: new Date(), prizeCents: 25000n, prizeSubscriberCents: 50000n,
    });
    await promo.awardPrize({ eventId: e.id, winnerId: winner.id, subscribedAtStart: true });

    const list = await request(server()).get('/admin/promo-events').set('Authorization', `Bearer ${admin.token}`).expect(200);
    expect(list.body[0]).toMatchObject({
      status: 'PAID', winnerName: 'Campeã da Silva', winnerSubscribed: true, prizePaidCents: '50000',
    });
    expect(list.body[0].winnerPhone).toMatch(/^\+55/);
  });

  it('cancels one that has not paid, and audits it', async () => {
    const admin = await makeUser('ADMIN');
    const e = await promo.createEvent({
      name: 'Nível 0', startsAt: new Date(), prizeCents: 25000n, prizeSubscriberCents: 50000n,
    });
    const res = await request(server())
      .post(`/admin/promo-events/${e.id}/cancel`)
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(201);
    expect(res.body.status).toBe('CANCELLED');
    expect(await prisma.auditLog.count({ where: { action: 'promo.cancel', targetId: e.id } })).toBe(1);
  });

  it('players cannot touch promotions', async () => {
    const player = await makeUser('PLAYER');
    await request(server()).get('/admin/promo-events').set('Authorization', `Bearer ${player.token}`).expect(403);
    await request(server())
      .post('/admin/promo-events')
      .set('Authorization', `Bearer ${player.token}`)
      .send(nivel0)
      .expect(403);
  });
});
