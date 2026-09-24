import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { AddressInfo } from 'net';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { io as ioClient, Socket } from 'socket.io-client';
import { AppModule } from '../app.module';
import { WalletService } from '../wallet/wallet.service';
import { PromoService, promoRoomId } from './promo.service';
import { SubscriptionRequestService } from '../payments/subscription-request.service';
import { resetDb } from '../test-utils/reset-db';

/**
 * The client's free promotion, played over real sockets as a multi-table
 * bracket (client, 2026-09-22): tables play down to one winner, the winners meet
 * at a final table, one champion wins R$250 — R$500 if a subscriber at the
 * start — paid by the company.
 *
 * Every test player behaves like the installed app (1.0.7): it joins the promo
 * room and sends each action with the promo room's id, never a table's. The
 * server routes it to wherever the bracket seated it.
 */
describe('Promotion bracket (e2e)', () => {
  let app: INestApplication;
  let jwt: JwtService;
  let wallet: WalletService;
  let promo: PromoService;
  let prisma: PrismaClient;
  let url: string;
  const sockets: Socket[] = [];
  let counter = 0;
  const ENV = {
    TOURNAMENT_HAND_DELAY_MS: '20',
    BRACKET_ROUND_DELAY_MS: '50',
    TURN_TIMEOUT_MS: '300',
    TOURNAMENT_DISCONNECT_GRACE_MS: '300',
  };
  const OLD_ENV: Record<string, string | undefined> = {};

  const R250 = 25000;
  const R500 = 50000;

  beforeAll(async () => {
    for (const [k, v] of Object.entries(ENV)) {
      OLD_ENV[k] = process.env[k];
      process.env[k] = v;
    }
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0);
    jwt = app.get(JwtService);
    wallet = app.get(WalletService);
    promo = app.get(PromoService);
    prisma = new PrismaClient();
    url = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    sockets.forEach((s) => s.close());
    await prisma.$disconnect();
    await app.close();
    for (const [k, v] of Object.entries(OLD_ENV)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await prisma.promoEvent.deleteMany();
    await prisma.tournamentWin.deleteMany();
    await prisma.playerLimit.deleteMany();
  });

  const event = (startsInMs: number, opts: { minPlayers?: number; maxPlayers?: number; waitMinutes?: number | null } = {}) =>
    promo.createEvent({
      name: 'Nível 0',
      startsAt: new Date(Date.now() + startsInMs),
      prizeCents: BigInt(R250),
      prizeSubscriberCents: BigInt(R500),
      minPlayers: opts.minPlayers ?? 2,
      maxPlayers: opts.maxPlayers,
      waitMinutes: opts.waitMinutes,
    });

  /** A player with an EMPTY wallet — the promotion must not need money. */
  async function player(extra: Record<string, unknown> = {}) {
    counter += 1;
    const user = await prisma.user.create({
      data: {
        phone: `+5511944400${counter.toString().padStart(4, '0')}`,
        displayName: `Promo${counter}`,
        cpf: `9300000${counter.toString().padStart(4, '0')}`,
        birthDate: new Date('1990-01-01'),
        status: 'ACTIVE',
        ...extra,
      },
    });
    const token = await jwt.signAsync({ sub: user.id, phone: user.phone });
    return { userId: user.id, token };
  }

  type Player = { userId: string; token: string };

  /**
   * Connect a player that goes all-in whenever it is their turn — or, when
   * [passive], never acts (an AFK player, or one kept to hold a hand open).
   * Actions go out under [roomId], exactly as the installed app sends them;
   * with a [gate], only once it opens.
   */
  async function connect(p: Player, roomId: string, passive = false, gate?: Promise<void>) {
    const socket = ioClient(url, { auth: { token: p.token }, transports: ['websocket'], reconnection: false });
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.on('connected', () => resolve());
      socket.on('connect_error', reject);
    });
    socket.on('game:state', (s: { actingPlayerId: string; legalActions: string[]; actingStack: number; actingCommitted: number }) => {
      if (passive || s.actingPlayerId !== p.userId) return;
      const la = s.legalActions;
      const action = la.includes('bet')
        ? { type: 'bet', amount: s.actingStack }
        : la.includes('raise')
          ? { type: 'raise', amount: s.actingStack + s.actingCommitted }
          : la.includes('call') ? { type: 'call' } : { type: 'check' };
      const act = () => socket.emit('hand:action', { tableId: roomId, action });
      if (gate) void gate.then(act);
      else act();
    });
    return socket;
  }

  const join = (socket: Socket, roomId: string) =>
    new Promise<{ ok: boolean; error?: string }>((resolve) =>
      // Exactly what the installed app sends for a room of level 0.
      socket.emit('table:join', { tableId: roomId, maxSeats: 8, level: 0 }, resolve),
    );

  const championOf = (socket: Socket) =>
    new Promise<{ winnerId?: string; prizeCents?: number }>((resolve) => {
      socket.on('hand:result', (r: { tournament?: { over: boolean; winnerId?: string; prizeCents?: number } }) => {
        if (r.tournament?.over) resolve(r.tournament);
      });
    });

  const lobby = async (token: string) =>
    (await request(app.getHttpServer()).get('/tables').set('Authorization', `Bearer ${token}`).expect(200)).body as {
      id: string; level: number; entryCents: number; name: string; maxSeats: number; players: number;
    }[];

  /** [n] all-in players in the room, joined at once; resolves with the champion. */
  async function playField(n: number, opts: { minPlayers?: number } = {}) {
    const e = await event(-1000, { minPlayers: opts.minPlayers ?? n });
    const roomId = promoRoomId(e.id);
    const players: Player[] = [];
    for (let i = 0; i < n; i++) players.push(await player());
    const socks = await Promise.all(players.map((p) => connect(p, roomId)));
    const moves = new Map<string, number>(); // userId → tables they were seated at
    const places = new Map<string, number>();
    const champion = new Promise<{ winnerId: string; prizeCents: number }>((resolve) =>
      socks[0].on('tournament:champion', resolve),
    );
    socks.forEach((s, i) => {
      s.on('tournament:table', () => moves.set(players[i].userId, (moves.get(players[i].userId) ?? 0) + 1));
      s.on('tournament:eliminated', (d: { place: number }) => places.set(players[i].userId, d.place));
    });
    const acks = await Promise.all(socks.map((s) => join(s, roomId)));
    expect(acks.every((a) => a.ok)).toBe(true);
    return { e, roomId, players, socks, moves, places, champion: await champion };
  }

  it('lists an open promotion first, as a free room with its places', async () => {
    const e = await event(-1000, { minPlayers: 80 });
    const a = await player();
    const b = await player();
    await join(await connect(a, promoRoomId(e.id)), promoRoomId(e.id));
    await join(await connect(b, promoRoomId(e.id)), promoRoomId(e.id));

    const rooms = await lobby(a.token);
    expect(rooms[0]).toMatchObject({ id: promoRoomId(e.id), level: 0, entryCents: 0, maxSeats: 100, players: 2 });
    expect(rooms[0].name).toMatch(/GRÁTIS/);
    expect(rooms.filter((r) => r.level > 0)).toHaveLength(7); // the paid rooms are still there
  });

  it('plays a free two-player promotion to a champion, paid R$250 by the company', async () => {
    const e = await event(-1000);
    const roomId = promoRoomId(e.id);
    const a = await player();
    const b = await player();
    const sa = await connect(a, roomId);
    const sb = await connect(b, roomId);
    const done = championOf(sa);

    expect(await join(sa, roomId)).toMatchObject({ ok: true });
    expect(await join(sb, roomId)).toMatchObject({ ok: true });
    const result = await done;

    expect([a.userId, b.userId]).toContain(result.winnerId);
    expect(result.prizeCents).toBe(R250);
    const loser = result.winnerId === a.userId ? b.userId : a.userId;
    expect(await wallet.getBalance(result.winnerId!)).toBe(BigInt(R250));
    expect(await wallet.getBalance(loser)).toBe(0n); // free entry: nobody was charged
    expect(await promo.totalSpentCents()).toBe(BigInt(R250));

    // Paid → the room leaves the lobby.
    expect((await lobby(a.token)).some((r) => r.id === roomId)).toBe(false);
  }, 60000);

  it('24 players: three tables, their winners at a final table, one champion paid once', async () => {
    const { players, moves, places, champion } = await playField(24);

    expect(players.map((p) => p.userId)).toContain(champion.winnerId);
    expect(champion.prizeCents).toBe(R250);
    // Every other player was knocked out and told their place; 2nd is the final's loser.
    expect(places.size).toBe(23);
    expect(places.has(champion.winnerId)).toBe(false);
    expect([...places.values()]).toContain(2);
    expect(Math.max(...places.values())).toBeLessThanOrEqual(24);
    // The champion was moved: a first-round table, then the final table.
    expect(moves.get(champion.winnerId)).toBe(2);

    expect(await wallet.getBalance(champion.winnerId)).toBe(BigInt(R250));
    expect(await promo.totalSpentCents()).toBe(BigInt(R250)); // exactly one prize
    const others = players.filter((p) => p.userId !== champion.winnerId);
    for (const p of others.slice(0, 5)) expect(await wallet.getBalance(p.userId)).toBe(0n);
  }, 120000);

  it('100 players: ten tables of ten, then a final table of the ten winners', async () => {
    const { champion, places, moves } = await playField(100);
    expect(champion.prizeCents).toBe(R250);
    expect(places.size).toBe(99);
    // Ten players reached the final table: the champion and places 2..10.
    const finalists = [...moves.entries()].filter(([, n]) => n === 2).map(([id]) => id);
    expect(finalists).toHaveLength(10);
    expect(finalists).toContain(champion.winnerId);
    for (const id of finalists) if (id !== champion.winnerId) expect(places.get(id)).toBeLessThanOrEqual(10);
    expect(await promo.totalSpentCents()).toBe(BigInt(R250));
  }, 240000);

  it('waits for its start time, then pays a subscriber R$500', async () => {
    const e = await event(1500); // starts in 1.5s
    const roomId = promoRoomId(e.id);
    const a = await player();
    const b = await player();
    const sa = await connect(a, roomId);
    const sb = await connect(b, roomId);
    let dealtEarly = false;
    sa.on('hand:hole', () => {
      if (Date.now() < e.startsAt.getTime()) dealtEarly = true;
    });
    const done = championOf(sa);

    await join(sa, roomId);
    await join(sb, roomId);
    // Both subscribe WHILE waiting — the rule is "assinante até o início".
    await prisma.user.updateMany({
      where: { id: { in: [a.userId, b.userId] } },
      data: { subscription: 'MONTHLY', subscriptionUntil: new Date(Date.now() + 30 * 86_400_000) },
    });

    const result = await done;
    expect(dealtEarly).toBe(false); // nothing dealt before the scheduled start
    expect(result.prizeCents).toBe(R500);
    expect(await wallet.getBalance(result.winnerId!)).toBe(BigInt(R500));
  }, 60000);

  it('a plan bought before the start and released mid-tournament still pays R$500', async () => {
    const e = await event(1500); // starts in 1.5s
    const roomId = promoRoomId(e.id);
    const a = await player();
    const b = await player();
    // Both pay through the fixed link before the start; nobody releases it yet.
    for (const p of [a, b]) {
      await prisma.subscriptionRequest.create({ data: { userId: p.userId, plan: 'MONTHLY', amountCents: 31250n } });
    }
    // Nobody plays until the plans have been released in the panel, after the start.
    let released!: () => void;
    const gate = new Promise<void>((r) => (released = r));
    const sa = await connect(a, roomId, false, gate);
    const sb = await connect(b, roomId, false, gate);
    const done = championOf(sa);
    sa.once('promo:started', async () => {
      const subs = app.get(SubscriptionRequestService);
      for (const r of await subs.list('REQUESTED')) await subs.confirm(r.id, 'conferido');
      released();
    });
    await join(sa, roomId);
    await join(sb, roomId);

    const result = await done;
    expect(result.prizeCents).toBe(R500);
    expect(await prisma.promoEvent.findUnique({ where: { id: e.id } })).toMatchObject({ startedWith: 2 });
  }, 60000);

  it('does not start below its minimum while the tolerance runs', async () => {
    const e = await event(-1000, { minPlayers: 3 });
    const roomId = promoRoomId(e.id);
    const sa = await connect(await player(), roomId);
    const sb = await connect(await player(), roomId);
    let dealt = false;
    sa.on('hand:hole', () => (dealt = true));

    await join(sa, roomId);
    await join(sb, roomId);
    await new Promise((r) => setTimeout(r, 500));
    expect(dealt).toBe(false);
  });

  it('after the tolerance it starts with whoever is there', async () => {
    const e = await event(-31 * 60_000, { minPlayers: 80, waitMinutes: 30 }); // 31 min late, 2 of 80
    const roomId = promoRoomId(e.id);
    const a = await player();
    const sa = await connect(a, roomId);
    const sb = await connect(await player(), roomId);
    const done = championOf(sa);
    await join(sa, roomId);
    await join(sb, roomId);
    expect((await done).prizeCents).toBe(R250);
  }, 60000);

  it('tells the room how many hold a place, and a leaver gives theirs back', async () => {
    const e = await event(-1000, { minPlayers: 80 });
    const roomId = promoRoomId(e.id);
    const sa = await connect(await player(), roomId);
    const sb = await connect(await player(), roomId);
    const counts: number[] = [];
    sa.on('promo:lobby', (d: { registered: number; minPlayers: number; maxPlayers: number }) => {
      counts.push(d.registered);
      expect(d).toMatchObject({ minPlayers: 80, maxPlayers: 100 });
    });
    await join(sa, roomId);
    await join(sb, roomId);
    await new Promise<void>((r) => sb.emit('table:leave', { tableId: roomId }, () => r()));
    await new Promise((r) => setTimeout(r, 100));
    expect(counts).toEqual([1, 2, 1]);
  });

  it('refuses a player once the places are gone', async () => {
    const e = await event(60_000, { maxPlayers: 2 }); // not started yet: nobody plays
    const roomId = promoRoomId(e.id);
    expect(await join(await connect(await player(), roomId), roomId)).toMatchObject({ ok: true });
    expect(await join(await connect(await player(), roomId), roomId)).toMatchObject({ ok: true });
    const third = await join(await connect(await player(), roomId), roomId);
    expect(third.ok).toBe(false);
    expect(third.error).toMatch(/vagas/);
  });

  it('nobody joins once the tournament is running', async () => {
    const e = await event(-1000);
    const roomId = promoRoomId(e.id);
    // Passive: the first hand stays open (for the turn clock), so it is running.
    const sa = await connect(await player(), roomId, true);
    const sb = await connect(await player(), roomId, true);
    const started = new Promise<void>((r) => sa.once('hand:hole', () => r()));
    await join(sa, roomId);
    await join(sb, roomId);
    await started;

    const late = await connect(await player(), roomId);
    const res = await join(late, roomId);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/já começou/);
  }, 30000);

  it('a player who never acts does not stall it: the clock checks or folds for them', async () => {
    const e = await event(-1000, { minPlayers: 3 });
    const roomId = promoRoomId(e.id);
    const afk = await player();
    const a = await player();
    const b = await player();
    const sa = await connect(a, roomId);
    const done = championOf(sa);
    await join(await connect(afk, roomId, true), roomId);
    await join(sa, roomId);
    await join(await connect(b, roomId), roomId);

    const result = await done;
    expect(result.winnerId).not.toBe(afk.userId);
    expect(result.prizeCents).toBe(R250);
  }, 90000);

  it('a player whose connection drops is withdrawn after the grace period; it still ends', async () => {
    const e = await event(-1000, { minPlayers: 3 });
    const roomId = promoRoomId(e.id);
    const gone = await player();
    const a = await player();
    const b = await player();
    const sGone = await connect(gone, roomId, true);
    sGone.once('hand:hole', () => sGone.close()); // the phone dies on the first deal
    const sa = await connect(a, roomId);
    const done = championOf(sa);
    await join(sGone, roomId);
    await join(sa, roomId);
    await join(await connect(b, roomId), roomId);

    const result = await done;
    expect([a.userId, b.userId]).toContain(result.winnerId);
    expect(await promo.totalSpentCents()).toBe(BigInt(R250));
  }, 90000);

  it('refuses the room when the promotion is not open yet', async () => {
    const e = await event(2 * 3_600_000); // two hours away (opens 30 min before)
    const roomId = promoRoomId(e.id);
    const s = await connect(await player(), roomId);
    const res = await join(s, roomId);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/não está disponível/);
  });

  it('keeps a self-excluded player out, prize or not', async () => {
    const e = await event(-1000);
    const roomId = promoRoomId(e.id);
    const p = await player();
    await prisma.playerLimit.create({
      data: { userId: p.userId, selfExcludedUntil: new Date(Date.now() + 7 * 86_400_000) },
    });
    const s = await connect(p, roomId);
    const res = await join(s, roomId);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/autoexclusão/i);
  });

  it('an unknown promotion id is refused, not turned into a practice table', async () => {
    const roomId = promoRoomId('00000000-0000-0000-0000-00000000dead');
    const s = await connect(await player(), roomId);
    const res = await join(s, roomId);
    expect(res.ok).toBe(false);
  });

  it("a bracket table cannot be joined directly by someone who isn't in it", async () => {
    const e = await event(-1000);
    const roomId = promoRoomId(e.id);
    const sa = await connect(await player(), roomId, true);
    const sb = await connect(await player(), roomId, true);
    const table = new Promise<string>((r) => sa.once('tournament:table', (d: { tableId: string }) => r(d.tableId)));
    await join(sa, roomId);
    await join(sb, roomId);
    const tableId = await table;

    const intruder = await connect(await player(), tableId);
    const res = await new Promise<{ ok: boolean; error?: string }>((r) =>
      intruder.emit('table:join', { tableId, maxSeats: 8 }, r),
    );
    expect(res.ok).toBe(false);
  }, 30000);
});
