import { PrismaClient } from '@prisma/client';
import { LedgerService } from '../wallet/ledger.service';
import { WalletService } from '../wallet/wallet.service';
import { PrismaService } from '../prisma/prisma.service';
import { resetDb } from '../test-utils/reset-db';
import { TournamentService } from './tournament.service';
import { Subscription } from './subscription';

/**
 * Money rules for the scheduled 10-minute rooms (client, 2026-09-17):
 *   a room is 10 tables = 80 seats, so 80 entrants is 100% occupancy;
 *   the prize pool is capped at 50% of what came in, so the house always keeps
 *   at least half — raised back to 100% once the subscriber base grows;
 *   a room that misses its minimum pays nothing and gives every entry back.
 */
describe('Scheduled room money (80 seats, 50% payout, refunds)', () => {
  let prisma: PrismaClient;
  let ledger: LedgerService;
  let wallet: WalletService;
  let tourn: TournamentService;
  let counter = 0;

  const ROOM_SEATS = 80;
  const HALF = 50;

  beforeAll(() => {
    prisma = new PrismaClient();
    ledger = new LedgerService(prisma as unknown as PrismaService);
    wallet = new WalletService(prisma as unknown as PrismaService, ledger);
    tourn = new TournamentService(prisma as unknown as PrismaService, ledger, wallet);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
  });

  async function fundedUser(cents: bigint): Promise<string> {
    counter += 1;
    const user = await prisma.user.create({
      data: {
        phone: `+5511922200${counter.toString().padStart(4, '0')}`,
        displayName: `S${counter}`,
        cpf: `9000000${counter.toString().padStart(4, '0')}`,
        birthDate: new Date('1990-01-01'),
      },
    });
    if (cents > 0n) await wallet.deposit(user.id, cents);
    return user.id;
  }

  /** [n] players enter room [tournamentId] at level 1 (R$20 each). */
  async function enter(tournamentId: string, n: number, sub: Subscription = 'NONE') {
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
      const id = await fundedUser(2000n);
      await tourn.escrowEntry({ tournamentId, userId: id, level: 1, subscription: sub });
      ids.push(id);
    }
    return ids;
  }

  const systemBalance = async (type: string) => {
    const acc = await prisma.account.findFirst({ where: { type: type as never } });
    return acc ? ledger.balanceOf(acc.id) : 0n;
  };

  describe('payout capped at half the money collected', () => {
    it('a full room (80) pays the winner R$200 and leaves R$800 for the house', async () => {
      const ids = await enter('sala-l1', ROOM_SEATS);
      const payout = await tourn.settle({
        tournamentId: 'sala-l1',
        level: 1,
        winnerId: ids[0],
        winnerSubscription: 'NONE',
        participants: ids.map((userId) => ({ userId, subscription: 'NONE' as Subscription })),
        capacity: ROOM_SEATS,
        prizePoolSharePct: HALF,
      });

      expect(payout.collectedCents).toBe(160000n); // 80 × R$20
      expect(payout.multiplier).toBe(200); // 100% occupancy
      expect(payout.prizePoolCents).toBe(80000n); // half of what came in
      expect(payout.winnerCents).toBe(20000n); // não assinante: 25% of the pool
      expect(payout.houseCents).toBe(140000n);
      expect(await wallet.getBalance(ids[0])).toBe(20000n);
    });

    it('an annual subscriber takes the whole pool, never more than half the room', async () => {
      const ids = await enter('sala-anual', ROOM_SEATS);
      const payout = await tourn.settle({
        tournamentId: 'sala-anual',
        level: 1,
        winnerId: ids[0],
        winnerSubscription: 'ANNUAL',
        participants: ids.map((userId) => ({ userId, subscription: 'NONE' as Subscription })),
        capacity: ROOM_SEATS,
        prizePoolSharePct: HALF,
      });

      expect(payout.winnerCents).toBe(80000n); // 100% of the pool = R$800
      expect(payout.houseCents).toBe(80000n); // house still keeps half
      expect(payout.winnerCents * 2n).toBe(payout.collectedCents);
    });

    it('the minimum room (40 of 80 seats) pays half as much', async () => {
      const ids = await enter('sala-minima', 40);
      const payout = await tourn.settle({
        tournamentId: 'sala-minima',
        level: 1,
        winnerId: ids[0],
        winnerSubscription: 'NONE',
        participants: ids.map((userId) => ({ userId, subscription: 'NONE' as Subscription })),
        capacity: ROOM_SEATS,
        prizePoolSharePct: HALF,
      });

      expect(payout.multiplier).toBe(100); // 50% occupancy
      expect(payout.collectedCents).toBe(80000n);
      expect(payout.prizePoolCents).toBe(40000n);
      expect(payout.winnerCents).toBe(10000n); // R$100
    });

    it('the current format is untouched: no share given = the old numbers', async () => {
      const ids = await enter('poker-l1', 8);
      const payout = await tourn.settle({
        tournamentId: 'poker-l1',
        level: 1,
        winnerId: ids[0],
        winnerSubscription: 'NONE',
        participants: ids.map((userId) => ({ userId, subscription: 'NONE' as Subscription })),
        capacity: 8,
      });

      expect(payout.prizePoolCents).toBe(16000n); // everything collected
      expect(payout.winnerCents).toBe(4000n); // R$40, as marketing was told
    });

    it('money is conserved whatever the share', async () => {
      const ids = await enter('sala-conserva', 40);
      const payout = await tourn.settle({
        tournamentId: 'sala-conserva',
        level: 1,
        winnerId: ids[0],
        winnerSubscription: 'NONE',
        participants: ids.map((userId) => ({ userId, subscription: 'NONE' as Subscription })),
        capacity: ROOM_SEATS,
        prizePoolSharePct: HALF,
      });

      expect(payout.winnerCents + payout.houseCents).toBe(payout.collectedCents);
      const all = await prisma.ledgerEntry.aggregate({ _sum: { amountCents: true } });
      expect(all._sum.amountCents ?? 0n).toBe(0n);
      expect(await systemBalance('PRIZE_POOL')).toBe(0n); // fully swept
    });
  });

  describe('a room that misses its minimum gives every entry back', () => {
    it('refunds each player exactly what they paid', async () => {
      const ids = await enter('sala-vazia', 12);
      expect(await wallet.getBalance(ids[0])).toBe(0n);

      const { refunded, totalCents } = await tourn.refundEntries('sala-vazia', ids);

      expect(refunded).toBe(12);
      expect(totalCents).toBe(24000n);
      for (const id of ids) expect(await wallet.getBalance(id)).toBe(2000n);
      expect(await systemBalance('PRIZE_POOL')).toBe(0n);
      expect(await systemBalance('HOUSE_RAKE')).toBe(0n); // the house keeps nothing
    });

    it('refunds a subscriber the discounted fee they actually paid', async () => {
      const id = await fundedUser(2000n);
      await tourn.escrowEntry({ tournamentId: 'sala-sub', userId: id, level: 1, subscription: 'ANNUAL' });
      expect(await wallet.getBalance(id)).toBe(1000n); // paid R$10

      await tourn.refundEntries('sala-sub', [id]);
      expect(await wallet.getBalance(id)).toBe(2000n);
    });

    it('is idempotent — a repeated refund pass pays nobody twice', async () => {
      const ids = await enter('sala-dupla', 5);
      const first = await tourn.refundEntries('sala-dupla', ids);
      const second = await tourn.refundEntries('sala-dupla', ids);

      expect(first.refunded).toBe(5);
      expect(second.refunded).toBe(0);
      for (const id of ids) expect(await wallet.getBalance(id)).toBe(2000n);
    });

    it('frees the room so the same player can enter the next window', async () => {
      const ids = await enter('poker-l1', 3);
      await tourn.refundEntries('poker-l1', ids);

      // Same room id, same players, next 10-minute window.
      for (const id of ids) {
        await tourn.escrowEntry({ tournamentId: 'poker-l1', userId: id, level: 1, subscription: 'NONE' });
        expect(await wallet.getBalance(id)).toBe(0n); // charged again, once
      }
      const { refunded } = await tourn.refundEntries('poker-l1', ids);
      expect(refunded).toBe(3);
      for (const id of ids) expect(await wallet.getBalance(id)).toBe(2000n);
    });

    it('ignores players who were never charged', async () => {
      const entered = await enter('sala-mista', 2);
      const bystander = await fundedUser(2000n);

      const { refunded } = await tourn.refundEntries('sala-mista', [...entered, bystander]);
      expect(refunded).toBe(2);
      expect(await wallet.getBalance(bystander)).toBe(2000n); // untouched
    });

    it('leaves the ledger balanced', async () => {
      const ids = await enter('sala-ledger', 6);
      await tourn.refundEntries('sala-ledger', ids);

      const all = await prisma.ledgerEntry.aggregate({ _sum: { amountCents: true } });
      expect(all._sum.amountCents ?? 0n).toBe(0n);
      const unbalanced = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
        'SELECT COUNT(*)::bigint AS count FROM (SELECT "transactionId" FROM "LedgerEntry" GROUP BY "transactionId" HAVING SUM("amountCents") <> 0) x',
      );
      expect(Number(unbalanced[0].count)).toBe(0);
    });
  });
});
