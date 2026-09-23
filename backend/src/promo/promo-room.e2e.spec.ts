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
import { resetDb } from '../test-utils/reset-db';

/**
 * The client's free-entry promotion, played over real sockets (2026-09-21):
 * the room appears in the lobby, entry costs nothing, the tournament starts at
 * its scheduled time with its minimum, nobody joins once it runs, and the one
 * prize — R$250, or R$500 for a subscriber at the start — is paid by the company.
 */
describe('Promotion room (e2e)', () => {
  let app: INestApplication;
  let jwt: JwtService;
  let wallet: WalletService;
  let promo: PromoService;
  let prisma: PrismaClient;
  let url: string;
  const sockets: Socket[] = [];
  let counter = 0;
  const OLD_DELAY = process.env.TOURNAMENT_HAND_DELAY_MS;

  const R250 = 25000;
  const R500 = 50000;

  beforeAll(async () => {
    process.env.TOURNAMENT_HAND_DELAY_MS = '50';
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
    if (OLD_DELAY === undefined) delete process.env.TOURNAMENT_HAND_DELAY_MS;
    else process.env.TOURNAMENT_HAND_DELAY_MS = OLD_DELAY;
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await prisma.promoEvent.deleteMany();
    await prisma.tournamentWin.deleteMany();
    await prisma.playerLimit.deleteMany();
  });

  const event = (startsInMs: number, minPlayers = 2) =>
    promo.createEvent({
      name: 'Nível 0',
      startsAt: new Date(Date.now() + startsInMs),
      prizeCents: BigInt(R250),
      prizeSubscriberCents: BigInt(R500),
      minPlayers,
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

  /**
   * Connect a player that goes all-in whenever it is their turn — or, when
   * [passive], never acts, so a tournament stays running for as long as needed.
   */
  async function connect(p: { userId: string; token: string }, tableId: string, passive = false) {
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
      socket.emit('hand:action', { tableId, action });
    });
    return socket;
  }

  const join = (socket: Socket, tableId: string) =>
    new Promise<{ ok: boolean; error?: string }>((resolve) =>
      // Exactly what the installed app sends for a room of level 0.
      socket.emit('table:join', { tableId, maxSeats: 8, level: 0 }, resolve),
    );

  const championOf = (socket: Socket) =>
    new Promise<{ winnerId?: string; prizeCents?: number }>((resolve) => {
      socket.on('hand:result', (r: { tournament?: { over: boolean; winnerId?: string; prizeCents?: number } }) => {
        if (r.tournament?.over) resolve(r.tournament);
      });
    });

  const lobby = async (token: string) =>
    (await request(app.getHttpServer()).get('/tables').set('Authorization', `Bearer ${token}`).expect(200)).body as {
      id: string; level: number; entryCents: number; name: string;
    }[];

  it('lists an open promotion first, as a free Nível 0 room', async () => {
    const e = await event(-1000);
    const { token } = await player();

    const rooms = await lobby(token);
    expect(rooms[0]).toMatchObject({ id: promoRoomId(e.id), level: 0, entryCents: 0 });
    expect(rooms[0].name).toMatch(/GRÁTIS/);
    expect(rooms.filter((r) => r.level > 0)).toHaveLength(7); // the paid rooms are still there
  });

  it('plays a free tournament to one champion, paid R$250 by the company', async () => {
    const e = await event(-1000);
    const tableId = promoRoomId(e.id);
    const a = await player();
    const b = await player();
    const sa = await connect(a, tableId);
    const sb = await connect(b, tableId);
    const done = championOf(sa);

    expect(await join(sa, tableId)).toMatchObject({ ok: true });
    expect(await join(sb, tableId)).toMatchObject({ ok: true });
    const result = await done;

    expect([a.userId, b.userId]).toContain(result.winnerId);
    expect(result.prizeCents).toBe(R250);
    const loser = result.winnerId === a.userId ? b.userId : a.userId;
    expect(await wallet.getBalance(result.winnerId!)).toBe(BigInt(R250));
    expect(await wallet.getBalance(loser)).toBe(0n); // free entry: nobody was charged
    expect(await promo.totalSpentCents()).toBe(BigInt(R250));

    // Paid → the room leaves the lobby.
    await new Promise((r) => setTimeout(r, 200));
    expect((await lobby(a.token)).some((r) => r.id === tableId)).toBe(false);
  }, 60000);

  it('waits for its start time, then pays a subscriber R$500', async () => {
    const e = await event(1500); // starts in 1.5s
    const tableId = promoRoomId(e.id);
    const a = await player();
    const b = await player();
    const sa = await connect(a, tableId);
    const sb = await connect(b, tableId);
    let dealtEarly = false;
    sa.on('hand:hole', () => {
      if (Date.now() < e.startsAt.getTime()) dealtEarly = true;
    });
    const done = championOf(sa);

    await join(sa, tableId);
    await join(sb, tableId);
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

  it('does not start below its minimum', async () => {
    const e = await event(-1000, 3); // needs 3
    const tableId = promoRoomId(e.id);
    const sa = await connect(await player(), tableId);
    const sb = await connect(await player(), tableId);
    let dealt = false;
    sa.on('hand:hole', () => (dealt = true));

    await join(sa, tableId);
    await join(sb, tableId);
    await new Promise((r) => setTimeout(r, 500));
    expect(dealt).toBe(false);
  });

  it('nobody joins once the tournament is running', async () => {
    const e = await event(-1000);
    const tableId = promoRoomId(e.id);
    // Passive: the first hand stays open, so the tournament is genuinely running.
    const sa = await connect(await player(), tableId, true);
    const sb = await connect(await player(), tableId, true);
    const started = new Promise<void>((r) => sa.once('hand:hole', () => r()));
    await join(sa, tableId);
    await join(sb, tableId);
    await started;

    const late = await connect(await player(), tableId);
    const res = await join(late, tableId);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/já começou/);
  }, 30000);

  it('refuses the room when the promotion is not open yet', async () => {
    const e = await event(2 * 3_600_000); // two hours away (opens 30 min before)
    const tableId = promoRoomId(e.id);
    const s = await connect(await player(), tableId);
    const res = await join(s, tableId);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/não está disponível/);
  });

  it('keeps a self-excluded player out, prize or not', async () => {
    const e = await event(-1000);
    const tableId = promoRoomId(e.id);
    const p = await player();
    await prisma.playerLimit.create({
      data: { userId: p.userId, selfExcludedUntil: new Date(Date.now() + 7 * 86_400_000) },
    });
    const s = await connect(p, tableId);
    const res = await join(s, tableId);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/autoexclusão/i);
  });

  it('an unknown promotion id is refused, not turned into a practice table', async () => {
    const tableId = promoRoomId('00000000-0000-0000-0000-00000000dead');
    const s = await connect(await player(), tableId);
    const res = await join(s, tableId);
    expect(res.ok).toBe(false);
  });
});
