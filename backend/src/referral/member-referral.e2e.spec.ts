import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { AddressInfo } from 'net';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { io as ioClient, Socket } from 'socket.io-client';
import { AppModule } from '../app.module';
import { resetDb } from '../test-utils/reset-db';
import { TournamentService } from '../tournament/tournament.service';
import { WalletService } from '../wallet/wallet.service';
import { entryFeeCents } from '../tournament/subscription';

/**
 * Players inviting players (client, 2026-10-14/15): everyone has a code, a
 * friend signs up with it, the referrer earns a fixed share of the friend's
 * first subscription + first paid entry, and the friend gets the bonus chips
 * in PAID tournaments while holding a plan.
 */
describe('Member referrals (e2e)', () => {
  let app: INestApplication;
  let jwt: JwtService;
  let prisma: PrismaClient;
  let tournament: TournamentService;
  let wallet: WalletService;
  let url: string;
  let adminToken: string;
  let counter = 0;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0);
    jwt = app.get(JwtService);
    tournament = app.get(TournamentService);
    wallet = app.get(WalletService);
    prisma = new PrismaClient();
    url = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    sockets.forEach((s) => s.close());
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    const admin = await prisma.user.create({
      data: { phone: '+5511900008888', displayName: 'Admin', cpf: '88888888888', birthDate: new Date('1980-01-01'), role: 'ADMIN' },
    });
    adminToken = await jwt.signAsync({ sub: admin.id, phone: admin.phone });
  });

  const server = () => app.getHttpServer();
  const asAdmin = (req: request.Test) => req.set('Authorization', `Bearer ${adminToken}`);

  async function player(name = `Jogador ${counter + 1}`, extra: Record<string, unknown> = {}) {
    counter += 1;
    const user = await prisma.user.create({
      data: {
        phone: `+55119777${counter.toString().padStart(5, '0')}`,
        displayName: name,
        cpf: `7770000${counter.toString().padStart(4, '0')}`,
        birthDate: new Date('1990-01-01'),
        status: 'ACTIVE',
        ...extra,
      },
    });
    return { ...user, token: await jwt.signAsync({ sub: user.id, phone: user.phone }) };
  }

  const myCode = async (token: string) =>
    (await request(server()).get('/auth/referral').set('Authorization', `Bearer ${token}`).expect(200)).body as {
      code: string;
      invited: number;
    };

  it('every player has a code from their first name, the same every time', async () => {
    await request(server()).get('/auth/referral').expect(401);
    const maria = await player('Maria Souza');
    const first = await myCode(maria.token);
    expect(first.code).toMatch(/^MARIA\d{2}$/);
    expect(first.invited).toBe(0);
    expect((await myCode(maria.token)).code).toBe(first.code);
  });

  it("a friend signs up with it (any case) and counts as the member's", async () => {
    const maria = await player('Maria');
    const { code } = await myCode(maria.token);
    const res = await request(server())
      .post('/auth/register')
      .send({ phone: '+5511990001234', displayName: 'Amigo', cpf: '111.444.777-35', birthDate: '1990-01-01', referralCode: code.toLowerCase() })
      .expect(201);
    const friend = await prisma.user.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(friend.referredById).toBe(maria.id);
    expect(friend.agentId).toBeNull();
    expect((await myCode(maria.token)).invited).toBe(1);
  });

  it('agent and member codes never collide', async () => {
    const maria = await player('Maria');
    const { code } = await myCode(maria.token);
    await asAdmin(request(server()).post('/admin/agents')).send({ name: 'Outro', code }).expect(409);
  });

  it('the admin links by a member code, never to oneself, and it replaces an agent', async () => {
    const maria = await player('Maria');
    const { code } = await myCode(maria.token);
    const agent = await prisma.agent.create({ data: { name: 'João', code: 'JOAO10' } });
    const bruno = await player('Bruno', { agentId: agent.id, agentLinkedAt: new Date() });

    const linked = await asAdmin(request(server()).post(`/admin/users/${bruno.id}/agent`)).send({ code }).expect(201);
    expect(linked.body).toMatchObject({ referredById: maria.id, agentId: null });
    const after = await prisma.user.findUniqueOrThrow({ where: { id: bruno.id } });
    expect([after.agentId, after.referredById]).toEqual([null, maria.id]);

    await asAdmin(request(server()).post(`/admin/users/${maria.id}/agent`)).send({ code }).expect(400);

    const players = await asAdmin(request(server()).get('/admin/players')).expect(200);
    expect(players.body.find((p: any) => p.id === bruno.id)).toMatchObject({ referrerCode: code, referrerName: 'Maria', agentCode: null });
  });

  it('commission: the plan’s share of the FIRST subscription + FIRST paid entry; refunds and renewals ignored', async () => {
    const maria = await player('Maria');
    const day = (d: number) => new Date(Date.UTC(2026, 9, d, 12));

    // Ana: quarterly (10%), renewed later; her first entry was refunded, the
    // second one counts.
    const ana = await player('Ana', { referredById: maria.id, referredAt: new Date() });
    await prisma.subscriptionRequest.createMany({
      data: [
        { userId: ana.id, plan: 'QUARTERLY', amountCents: 15000n, status: 'CONFIRMED', settledAt: day(2) },
        { userId: ana.id, plan: 'ANNUAL', amountCents: 99900n, status: 'CONFIRMED', settledAt: day(9) }, // renewal
      ],
    });
    await wallet.deposit(ana.id, 100000n);
    await tournament.escrowEntry({ tournamentId: 'poker-l3', userId: ana.id, level: 3, subscription: 'QUARTERLY' });
    await tournament.refundEntry('poker-l3', ana.id); // the room never started
    const { entryCents } = await tournament.escrowEntry({ tournamentId: 'poker-l2', userId: ana.id, level: 2, subscription: 'QUARTERLY' });
    await tournament.escrowEntry({ tournamentId: 'poker-l1', userId: ana.id, level: 1, subscription: 'QUARTERLY' }); // later
    expect(entryCents).toBe(entryFeeCents(2, 'QUARTERLY'));

    // Bruno: played, never subscribed — no commission.
    const bruno = await player('Bruno', { referredById: maria.id, referredAt: new Date() });
    await wallet.deposit(bruno.id, 10000n);
    await tournament.escrowEntry({ tournamentId: 'poker-l1', userId: bruno.id, level: 1, subscription: 'NONE' });

    // Carla: annual (20%), no tournament yet.
    const carla = await player('Carla', { referredById: maria.id, referredAt: new Date() });
    await prisma.subscriptionRequest.create({
      data: { userId: carla.id, plan: 'ANNUAL', amountCents: 50000n, status: 'CONFIRMED', settledAt: day(3) },
    });

    const res = await asAdmin(request(server()).get(`/admin/referrals/${maria.id}`)).expect(200);
    const row = (id: string) => res.body.referred.find((r: any) => r.userId === id);
    const anaBase = 15000n + entryCents;
    expect(row(ana.id)).toMatchObject({
      pct: 10,
      firstSubscription: { plan: 'QUARTERLY', amountCents: '15000' },
      firstEntry: { amountCents: entryCents.toString() },
      baseCents: anaBase.toString(),
      commissionCents: ((anaBase * 10n) / 100n).toString(),
    });
    expect(row(bruno.id)).toMatchObject({ pct: 0, firstSubscription: null, commissionCents: '0' });
    expect(row(bruno.id).firstEntry).not.toBeNull();
    expect(row(carla.id)).toMatchObject({ pct: 20, firstEntry: null, baseCents: '50000', commissionCents: '10000' });
    const total = (anaBase * 10n) / 100n + 10000n;
    expect(res.body).toMatchObject({ invited: 3, subscribers: 2, commissionCents: total.toString() });

    const list = await asAdmin(request(server()).get('/admin/referrals')).expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ userId: maria.id, invited: 3, commissionCents: total.toString() });
  });

  describe('bonus chips', () => {
    async function connect(token: string): Promise<Socket> {
      const socket = ioClient(url, { auth: { token }, transports: ['websocket'], reconnection: false });
      sockets.push(socket);
      await new Promise<void>((resolve, reject) => {
        socket.on('connected', () => resolve());
        socket.on('connect_error', reject);
      });
      return socket;
    }
    type Chips = { stacks: Record<string, number>; bets: Record<string, number> };
    const join = (s: Socket, body: Record<string, unknown>) =>
      new Promise<{ ok: boolean; error?: string }>((r) => s.emit('table:join', body, r));

    it('in a paid room a referred subscriber starts with their plan’s chips; others 1000', async () => {
      const maria = await player('Maria');
      const annual = { subscription: 'ANNUAL', subscriptionUntil: new Date(Date.now() + 365 * 86_400_000) };
      const friend = await player('Amigo', { referredById: maria.id, referredAt: new Date(), ...annual });
      const plain = await player('Sem código', annual); // a plan but no code: no bonus
      await wallet.deposit(friend.id, 100000n);
      await wallet.deposit(plain.id, 100000n);

      const sf = await connect(friend.token);
      const sp = await connect(plain.token);
      const first = new Promise<Chips>((r) => sp.once('game:state', r));
      expect((await join(sf, { tableId: 'poker-l1', maxSeats: 8, level: 1 })).ok).toBe(true);
      expect((await join(sp, { tableId: 'poker-l1', maxSeats: 8, level: 1 })).ok).toBe(true);
      const st = await first;
      expect(st.stacks[friend.id] + (st.bets[friend.id] ?? 0)).toBe(3000);
      expect(st.stacks[plain.id] + (st.bets[plain.id] ?? 0)).toBe(1000);
    }, 30000);

    it('a lapsed plan is back to 1000', async () => {
      const maria = await player('Maria');
      const friend = await player('Amigo', {
        referredById: maria.id,
        referredAt: new Date(),
        subscription: 'ANNUAL',
        subscriptionUntil: new Date(Date.now() - 86_400_000),
      });
      const other = await player('Outro');
      await wallet.deposit(friend.id, 100000n);
      await wallet.deposit(other.id, 100000n);
      const sf = await connect(friend.token);
      const so = await connect(other.token);
      const first = new Promise<Chips>((r) => so.once('game:state', r));
      await join(sf, { tableId: 'poker-l2', maxSeats: 8, level: 2 });
      await join(so, { tableId: 'poker-l2', maxSeats: 8, level: 2 });
      const st = await first;
      expect(st.stacks[friend.id] + (st.bets[friend.id] ?? 0)).toBe(1000);
    }, 30000);
  });
});
