import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../app.module';
import { resetDb } from '../test-utils/reset-db';

/**
 * Referral codes (client, 2026-10-12): agents in the panel, the code at
 * sign-up, linking by hand, and the commission report on the FIRST
 * subscription + FIRST deposit.
 */
describe('Referral codes (e2e)', () => {
  let app: INestApplication;
  let jwt: JwtService;
  let prisma: PrismaClient;
  let adminToken: string;
  let counter = 0;

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
    const admin = await prisma.user.create({
      data: { phone: '+5511900009999', displayName: 'Admin', cpf: '99999999999', birthDate: new Date('1980-01-01'), role: 'ADMIN' },
    });
    adminToken = await jwt.signAsync({ sub: admin.id, phone: admin.phone });
  });

  const server = () => app.getHttpServer();
  const asAdmin = (req: request.Test) => req.set('Authorization', `Bearer ${adminToken}`);

  const signUp = (extra: Record<string, unknown> = {}) =>
    request(server())
      .post('/auth/register')
      .send({ phone: '+5511990001234', displayName: 'Jogador', cpf: '111.444.777-35', birthDate: '1990-01-01', ...extra });

  async function makePlayer(agentId?: string) {
    counter += 1;
    return prisma.user.create({
      data: {
        phone: `+55119888${counter.toString().padStart(5, '0')}`,
        displayName: `Jogador ${counter}`,
        cpf: `8880000${counter.toString().padStart(4, '0')}`,
        birthDate: new Date('1990-01-01'),
        ...(agentId ? { agentId, agentLinkedAt: new Date() } : {}),
      },
    });
  }

  it('agents are admin-only', async () => {
    await request(server()).get('/admin/agents').expect(401);
    const player = await makePlayer();
    const token = await jwt.signAsync({ sub: player.id, phone: player.phone });
    await request(server()).get('/admin/agents').set('Authorization', `Bearer ${token}`).expect(403);
  });

  it('creates agents: typed code normalized, blank code suggested, duplicates refused', async () => {
    const a = await asAdmin(request(server()).post('/admin/agents'))
      .send({ name: 'João Silva', code: ' joao 10 ', commissionPct: 10 })
      .expect(201);
    expect(a.body).toMatchObject({ name: 'João Silva', code: 'JOAO10', commissionPct: 10, active: true, players: 0 });

    const b = await asAdmin(request(server()).post('/admin/agents')).send({ name: 'Maria Souza' }).expect(201);
    expect(b.body.code).toMatch(/^MARIA\d{2}$/);
    expect(b.body.commissionPct).toBeNull();

    await asAdmin(request(server()).post('/admin/agents')).send({ name: 'Outro', code: 'joao10' }).expect(409);
    await asAdmin(request(server()).post('/admin/agents')).send({ name: 'Outro', code: 'JO' }).expect(400);

    const list = await asAdmin(request(server()).get('/admin/agents')).expect(200);
    expect(list.body.map((x: any) => x.code)).toEqual(['JOAO10', b.body.code]);
  });

  it('a valid code at sign-up links the player to the agent', async () => {
    const agent = await prisma.agent.create({ data: { name: 'João', code: 'JOAO10' } });
    const res = await signUp({ referralCode: 'joao10' }).expect(201);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(user.agentId).toBe(agent.id);
    expect(user.agentLinkedAt).toBeInstanceOf(Date);
  });

  it('an unknown or deactivated code fails the sign-up, writing nothing', async () => {
    await prisma.agent.create({ data: { name: 'Antigo', code: 'ANTIGO1', active: false } });
    for (const referralCode of ['NAOEXISTE', 'ANTIGO1', '??']) {
      const res = await signUp({ referralCode }).expect(400);
      expect(res.body.message).toBe('Código de indicação inválido.');
    }
    expect(await prisma.user.count({ where: { role: 'PLAYER' } })).toBe(0);
  });

  it('no code, or a blank one, signs up with no agent (older apps)', async () => {
    const res = await signUp({ referralCode: '  ' }).expect(201);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(user.agentId).toBeNull();
  });

  it('the admin links, re-links and unlinks a player; the players list shows the code', async () => {
    const agent = await prisma.agent.create({ data: { name: 'João', code: 'JOAO10' } });
    const player = await makePlayer();

    const linked = await asAdmin(request(server()).post(`/admin/users/${player.id}/agent`))
      .send({ code: 'joao10' })
      .expect(201);
    expect(linked.body).toMatchObject({ ok: true, agentId: agent.id, code: 'JOAO10' });
    const players = await asAdmin(request(server()).get('/admin/players')).expect(200);
    expect(players.body.find((p: any) => p.id === player.id).agentCode).toBe('JOAO10');

    await asAdmin(request(server()).post(`/admin/users/${player.id}/agent`)).send({ code: 'NADA99' }).expect(400);

    await asAdmin(request(server()).post(`/admin/users/${player.id}/agent`)).send({ code: null }).expect(201);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: player.id } });
    expect(after.agentId).toBeNull();
  });

  it('report: commission on the FIRST subscription + FIRST deposit only', async () => {
    const agent = await prisma.agent.create({ data: { name: 'João', code: 'JOAO10', commissionPct: 10 } });
    const other = await prisma.agent.create({ data: { name: 'Maria', code: 'MARIA20' } });
    const day = (d: number) => new Date(Date.UTC(2026, 9, d, 12));

    // Ana: quarterly then a renewal; a card deposit BEFORE a Pix one.
    const ana = await makePlayer(agent.id);
    await prisma.subscriptionRequest.createMany({
      data: [
        { userId: ana.id, plan: 'QUARTERLY', amountCents: 15000n, status: 'CONFIRMED', settledAt: day(2) },
        { userId: ana.id, plan: 'QUARTERLY', amountCents: 15000n, status: 'CONFIRMED', settledAt: day(9) }, // renewal
        { userId: ana.id, plan: 'ANNUAL', amountCents: 99900n, status: 'REJECTED', settledAt: day(1) },
      ],
    });
    await prisma.paymentOrder.create({
      data: { orderNsu: 'nsu-1', userId: ana.id, amountCents: 5000n, purpose: 'DEPOSIT', status: 'PAID', paidAt: day(3) },
    });
    await prisma.paymentOrder.create({
      data: { orderNsu: 'nsu-2', userId: ana.id, amountCents: 7000n, purpose: 'DEPOSIT', status: 'PENDING' },
    });
    await prisma.deposit.create({
      data: { userId: ana.id, amountCents: 20000n, pixReference: 'pix-1', status: 'CONFIRMED', settledAt: day(4) },
    });

    // Bruno: only a Pix deposit (code but no plan).
    const bruno = await makePlayer(agent.id);
    await prisma.deposit.create({
      data: { userId: bruno.id, amountCents: 3000n, pixReference: 'pix-2', status: 'CONFIRMED', settledAt: day(5) },
    });

    // Carla: nothing paid yet. Dan: another agent's player.
    await makePlayer(agent.id);
    const dan = await makePlayer(other.id);
    await prisma.deposit.create({
      data: { userId: dan.id, amountCents: 99900n, pixReference: 'pix-3', status: 'CONFIRMED', settledAt: day(5) },
    });

    const res = await asAdmin(request(server()).get(`/admin/agents/${agent.id}/report`)).expect(200);
    expect(res.body).toMatchObject({ code: 'JOAO10', players: 3, subscribers: 1 });
    const anaRow = res.body.referred.find((r: any) => r.userId === ana.id);
    expect(anaRow.firstSubscription).toMatchObject({ plan: 'QUARTERLY', amountCents: '15000' });
    expect(anaRow.firstDeposit).toMatchObject({ amountCents: '5000', via: 'CARTAO' });
    expect(anaRow).toMatchObject({ baseCents: '20000', commissionCents: '2000' });
    const brunoRow = res.body.referred.find((r: any) => r.userId === bruno.id);
    expect(brunoRow).toMatchObject({ firstSubscription: null, baseCents: '3000', commissionCents: '300' });
    expect(brunoRow.firstDeposit.via).toBe('PIX');
    // 15000 + 5000 + 3000 = 23000 → 10% = 2300.
    expect(res.body).toMatchObject({ baseCents: '23000', commissionCents: '2300' });

    // No percentage agreed: the base is shown, the commission left blank.
    const list = await asAdmin(request(server()).get('/admin/agents')).expect(200);
    expect(list.body.find((a: any) => a.code === 'MARIA20')).toMatchObject({ players: 1, baseCents: '99900', commissionCents: null });
  });

  it('deactivating keeps the players; the code stops working at sign-up', async () => {
    const agent = await prisma.agent.create({ data: { name: 'João', code: 'JOAO10' } });
    await makePlayer(agent.id);
    const res = await asAdmin(request(server()).patch(`/admin/agents/${agent.id}`))
      .send({ active: false, commissionPct: 15 })
      .expect(200);
    expect(res.body).toMatchObject({ active: false, commissionPct: 15, players: 1 });
    await signUp({ referralCode: 'JOAO10' }).expect(400);
  });
});
