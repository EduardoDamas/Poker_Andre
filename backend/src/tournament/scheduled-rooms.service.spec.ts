import { PrismaClient } from '@prisma/client';
import { LedgerService } from '../wallet/ledger.service';
import { WalletService } from '../wallet/wallet.service';
import { PrismaService } from '../prisma/prisma.service';
import { resetDb } from '../test-utils/reset-db';
import { TournamentService } from './tournament.service';
import {
  ScheduledRoomsService,
  ROOM_SEATS,
  ROOM_LEVELS,
  minPlayersThatWinSomething,
} from './scheduled-rooms.service';

/**
 * The 10-minute rooms (client spec, 2026-09-17): a room per level opens on the
 * clock, players register for the next window, too few players means everyone
 * gets their money back, and nobody joins a tournament already running.
 */
describe('ScheduledRoomsService (10-minute rooms)', () => {
  let prisma: PrismaClient;
  let ledger: LedgerService;
  let wallet: WalletService;
  let tourn: TournamentService;
  let rooms: ScheduledRoomsService;
  let counter = 0;

  const ENV = { min: process.env.ROOM_MIN_PLAYERS, win: process.env.TOURNAMENT_WINDOW_MINUTES };

  beforeAll(() => {
    prisma = new PrismaClient();
    ledger = new LedgerService(prisma as unknown as PrismaService);
    wallet = new WalletService(prisma as unknown as PrismaService, ledger);
    tourn = new TournamentService(prisma as unknown as PrismaService, ledger, wallet);
    rooms = new ScheduledRoomsService(prisma as unknown as PrismaService, tourn);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await prisma.roomRegistration.deleteMany();
    // 8 is the floor: below 10% occupancy the prize table pays nothing, so no
    // setting can make a window run with fewer.
    process.env.ROOM_MIN_PLAYERS = '8';
  });

  afterEach(() => {
    if (ENV.min === undefined) delete process.env.ROOM_MIN_PLAYERS;
    else process.env.ROOM_MIN_PLAYERS = ENV.min;
    if (ENV.win === undefined) delete process.env.TOURNAMENT_WINDOW_MINUTES;
    else process.env.TOURNAMENT_WINDOW_MINUTES = ENV.win;
  });

  async function player(cents = 5000n): Promise<string> {
    counter += 1;
    const u = await prisma.user.create({
      data: {
        phone: `+5511911100${counter.toString().padStart(4, '0')}`,
        displayName: `R${counter}`,
        cpf: `9100000${counter.toString().padStart(4, '0')}`,
        birthDate: new Date('1990-01-01'),
        status: 'ACTIVE',
      },
    });
    if (cents > 0n) await wallet.deposit(u.id, cents);
    return u.id;
  }

  async function registerMany(n: number, level = 1): Promise<string[]> {
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
      const id = await player();
      await rooms.register(id, level, 'NONE');
      ids.push(id);
    }
    return ids;
  }

  describe('windows land on the clock', () => {
    it('rounds down to the current 10-minute slot', () => {
      expect(rooms.windowStart(new Date('2026-09-17T14:07:31Z')).toISOString())
        .toBe('2026-09-17T14:00:00.000Z');
      expect(rooms.windowStart(new Date('2026-09-17T14:19:59Z')).toISOString())
        .toBe('2026-09-17T14:10:00.000Z');
    });

    it('registration always targets the next slot', () => {
      expect(rooms.nextWindowStart(new Date('2026-09-17T14:07:31Z')).toISOString())
        .toBe('2026-09-17T14:10:00.000Z');
      expect(rooms.nextWindowStart(new Date('2026-09-17T14:10:00Z')).toISOString())
        .toBe('2026-09-17T14:20:00.000Z');
    });

    it('honours a different window length', () => {
      process.env.TOURNAMENT_WINDOW_MINUTES = '5';
      expect(rooms.nextWindowStart(new Date('2026-09-17T14:07:00Z')).toISOString())
        .toBe('2026-09-17T14:10:00.000Z');
    });

    it('gives each level and window its own room id', () => {
      const w1 = new Date('2026-09-17T14:10:00Z');
      const w2 = new Date('2026-09-17T14:20:00Z');
      expect(rooms.roomId(1, w1)).not.toBe(rooms.roomId(2, w1));
      expect(rooms.roomId(1, w1)).not.toBe(rooms.roomId(1, w2));
    });

    it('opens a room for every level', async () => {
      const schedule = await rooms.schedule();
      expect(schedule.map((s) => s.level)).toEqual(ROOM_LEVELS);
      expect(schedule[0].seats).toBe(ROOM_SEATS);
      expect(schedule.every((s) => s.startsAt.getTime() > Date.now())).toBe(true);
    });
  });

  describe('registering for the next window', () => {
    it('charges the entry and takes a seat', async () => {
      const id = await player();
      const s = await rooms.register(id, 1, 'NONE');

      expect(s.registered).toBe(1);
      expect(s.registered_me).toBe(true);
      expect(await wallet.getBalance(id)).toBe(3000n); // R$50 − R$20
    });

    it('charges a subscriber their discounted entry', async () => {
      const id = await player();
      await rooms.register(id, 1, 'ANNUAL');
      expect(await wallet.getBalance(id)).toBe(4000n); // R$10 for annual
    });

    it('registering twice does not charge twice', async () => {
      const id = await player();
      await rooms.register(id, 1, 'NONE');
      const again = await rooms.register(id, 1, 'NONE');

      expect(again.registered).toBe(1);
      expect(await wallet.getBalance(id)).toBe(3000n);
    });

    it('refuses when the wallet cannot cover the entry, and takes no seat', async () => {
      const broke = await player(500n); // R$5 < R$20
      await expect(rooms.register(broke, 1, 'NONE')).rejects.toThrow(/insuficiente/i);

      const s = await rooms.schedule(broke);
      expect(s[0].registered).toBe(0);
      expect(s[0].registered_me).toBe(false);
    });

    it('rejects an unknown level', async () => {
      const id = await player();
      await expect(rooms.register(id, 9, 'NONE')).rejects.toThrow(/Nível inválido/);
    });

    it('cancelling before the start gives the entry back', async () => {
      const id = await player();
      await rooms.register(id, 1, 'NONE');
      const s = await rooms.cancel(id, 1);

      expect(s.registered).toBe(0);
      expect(s.registered_me).toBe(false);
      expect(await wallet.getBalance(id)).toBe(5000n);
      await expect(rooms.cancel(id, 1)).rejects.toThrow(/não está inscrito/i);
    });

    it('a cancelled player can register again for the same window', async () => {
      const id = await player();
      await rooms.register(id, 1, 'NONE');
      await rooms.cancel(id, 1);
      const s = await rooms.register(id, 1, 'NONE');

      expect(s.registered).toBe(1);
      expect(await wallet.getBalance(id)).toBe(3000n); // charged once, now
    });

    it('counts each level separately', async () => {
      const id = await player(20000n);
      await rooms.register(id, 1, 'NONE');
      await rooms.register(id, 2, 'NONE');

      const schedule = await rooms.schedule(id);
      expect(schedule[0].registered).toBe(1);
      expect(schedule[1].registered).toBe(1);
      expect(schedule[2].registered).toBe(0);
      expect(await wallet.getBalance(id)).toBe(14000n); // R$200 − R$20 − R$40
    });
  });

  describe('when the window closes', () => {
    it('runs the tournament once the minimum is there', async () => {
      const ids = await registerMany(8);
      const window = rooms.nextWindowStart();

      const [outcome] = await rooms.closeWindow(window);
      expect(outcome.started).toBe(true);
      expect(outcome.players).toHaveLength(8);
      expect(outcome.players.map((p) => p.userId).sort()).toEqual([...ids].sort());
      // Entries stay escrowed for the prize; nothing is given back.
      for (const id of ids) expect(await wallet.getBalance(id)).toBe(3000n);
    });

    it('gives every entry back when too few showed up', async () => {
      const ids = await registerMany(3); // minimum is 8
      const window = rooms.nextWindowStart();

      const [outcome] = await rooms.closeWindow(window);
      expect(outcome.started).toBe(false);
      expect(outcome.refunded).toBe(3);
      for (const id of ids) expect(await wallet.getBalance(id)).toBe(5000n); // whole again
    });

    it('decides each level on its own', async () => {
      await registerMany(8, 1); // enough
      await registerMany(3, 2); // not enough
      const window = rooms.nextWindowStart();

      const outcomes = await rooms.closeWindow(window);
      expect(outcomes.find((o) => o.level === 1)?.started).toBe(true);
      expect(outcomes.find((o) => o.level === 2)?.started).toBe(false);
      expect(outcomes.find((o) => o.level === 3)).toBeUndefined(); // nobody registered
    });

    it('closing the same window twice changes nothing', async () => {
      const ids = await registerMany(3);
      const window = rooms.nextWindowStart();

      const first = await rooms.closeWindow(window);
      const second = await rooms.closeWindow(window);

      expect(first[0].refunded).toBe(3);
      expect(second).toHaveLength(0); // no seats left to settle
      for (const id of ids) expect(await wallet.getBalance(id)).toBe(5000n); // refunded once
    });

    it('a refunded player can enter the following window', async () => {
      const ids = await registerMany(2);
      await rooms.closeWindow(rooms.nextWindowStart());
      for (const id of ids) expect(await wallet.getBalance(id)).toBe(5000n);

      // Next window: same players, same level, charged again.
      for (const id of ids) await rooms.register(id, 1, 'NONE');
      const schedule = await rooms.schedule(ids[0]);
      expect(schedule[0].registered).toBe(2);
      for (const id of ids) expect(await wallet.getBalance(id)).toBe(3000n);
    });

    it('a started room always pays its champion something', async () => {
      process.env.ROOM_MIN_PLAYERS = '8';
      const ids = await registerMany(8);
      const [outcome] = await rooms.closeWindow(rooms.nextWindowStart());
      expect(outcome.started).toBe(true);

      const payout = await rooms.settleRoom({
        roomId: outcome.roomId,
        level: outcome.level,
        winnerId: ids[0],
        players: outcome.players,
      });

      expect(payout.collectedCents).toBe(16000n);
      expect(payout.multiplier).toBeGreaterThan(0);
      expect(payout.winnerCents).toBeGreaterThan(0n);
      expect(payout.winnerCents).toBe(2000n); // R$20 at 10% occupancy
    });

    it('a full room pays the champion R$200 and keeps half', async () => {
      process.env.ROOM_MIN_PLAYERS = '80';
      const ids = await registerMany(ROOM_SEATS);
      const [outcome] = await rooms.closeWindow(rooms.nextWindowStart());
      expect(outcome.started).toBe(true);

      const payout = await rooms.settleRoom({
        roomId: outcome.roomId,
        level: outcome.level,
        winnerId: ids[0],
        players: outcome.players,
      });

      expect(payout.multiplier).toBe(200);
      expect(payout.collectedCents).toBe(160000n);
      expect(payout.winnerCents).toBe(20000n); // R$200
      expect(payout.houseCents).toBe(140000n);
    }, 120000);
  });

  describe('the minimum is adjustable without a deploy', () => {
    it('follows ROOM_MIN_PLAYERS upwards', async () => {
      process.env.ROOM_MIN_PLAYERS = '40';
      expect(rooms.minPlayers).toBe(40);

      const ids = await registerMany(10); // short of 40
      const [outcome] = await rooms.closeWindow(rooms.nextWindowStart());
      expect(outcome.started).toBe(false);
      for (const id of ids) expect(await wallet.getBalance(id)).toBe(5000n);
    });

    it('never goes below the point where the prize table pays', () => {
      expect(minPlayersThatWinSomething()).toBe(8); // 10% of 80 seats
      for (const value of ['2', '4', '7', '1', 'muitos', '9999', '']) {
        process.env.ROOM_MIN_PLAYERS = value;
        expect(rooms.minPlayers).toBeGreaterThanOrEqual(8);
      }
    });

    it('refunds a room too empty to win anything, whatever the setting says', async () => {
      process.env.ROOM_MIN_PLAYERS = '2'; // asked for 2; the floor is 8
      const ids = await registerMany(4);

      const [outcome] = await rooms.closeWindow(rooms.nextWindowStart());
      expect(outcome.started).toBe(false);
      expect(outcome.refunded).toBe(4);
      // Nobody played for a prize of nothing; everyone has their money back.
      for (const id of ids) expect(await wallet.getBalance(id)).toBe(5000n);
    });
  });
});
