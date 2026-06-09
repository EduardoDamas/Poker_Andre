import { PrismaClient } from '@prisma/client';
import { LedgerService } from '../wallet/ledger.service';
import { WalletService } from '../wallet/wallet.service';
import { PrismaService } from '../prisma/prisma.service';
import { resetDb } from '../test-utils/reset-db';
import { TournamentService, PHASE1_ROOM_CAPACITY } from './tournament.service';
import { Subscription } from './subscription';

describe('TournamentService (entry escrow + prize payout)', () => {
  let prisma: PrismaClient;
  let ledger: LedgerService;
  let wallet: WalletService;
  let tourn: TournamentService;
  let counter = 0;

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
        phone: `+5511944400${counter.toString().padStart(3, '0')}`,
        displayName: `T${counter}`,
        cpf: `4000000000${counter.toString().padStart(2, '0')}`,
        birthDate: new Date('1990-01-01'),
      },
    });
    if (cents > 0n) await wallet.deposit(user.id, cents);
    return user.id;
  }

  async function balanceOf(userId: string): Promise<bigint> {
    const acc = await prisma.account.findUnique({ where: { userId } });
    return acc ? ledger.balanceOf(acc.id) : 0n;
  }

  async function systemBalance(type: string): Promise<bigint> {
    const acc = await prisma.account.findFirst({ where: { type: type as never } });
    return acc ? ledger.balanceOf(acc.id) : 0n;
  }

  it('escrows the entry fee from the wallet', async () => {
    const u = await fundedUser(5000n); // R$50
    const { entryCents } = await tourn.escrowEntry({
      tournamentId: 't1', userId: u, level: 1, subscription: 'NONE',
    });
    expect(entryCents).toBe(2000n); // R$20 level-1 não-assinante
    expect(await balanceOf(u)).toBe(3000n);
    expect(await systemBalance('PRIZE_POOL')).toBe(2000n);
  });

  it('rejects entry when the wallet is short', async () => {
    const u = await fundedUser(1000n); // R$10 < R$20 entry
    await expect(
      tourn.escrowEntry({ tournamentId: 't2', userId: u, level: 1, subscription: 'NONE' }),
    ).rejects.toThrow(/insuficiente/i);
  });

  it('entry is idempotent (same reference cannot double-charge)', async () => {
    const u = await fundedUser(5000n);
    await tourn.escrowEntry({ tournamentId: 't3', userId: u, level: 1, subscription: 'NONE' });
    await expect(
      tourn.escrowEntry({ tournamentId: 't3', userId: u, level: 1, subscription: 'NONE' }),
    ).rejects.toThrow();
    expect(await balanceOf(u)).toBe(3000n); // charged only once
  });

  it('full table (8 non-subscribers) pays winner 25% of a 200× prize, conserves money', async () => {
    // 8 players, level 1, entry R$20 each → collected R$160 = 16000 cents.
    const subs: Subscription[] = Array(8).fill('NONE');
    const ids: string[] = [];
    for (const s of subs) {
      const u = await fundedUser(2000n);
      ids.push(u);
      await tourn.escrowEntry({ tournamentId: 't4', userId: u, level: 1, subscription: s });
    }
    expect(await systemBalance('PRIZE_POOL')).toBe(16000n);

    const winner = ids[0];
    const result = await tourn.settle({
      tournamentId: 't4',
      level: 1,
      winnerId: winner,
      winnerSubscription: 'NONE',
      participants: ids.map((id) => ({ userId: id, subscription: 'NONE' as Subscription })),
    });

    // occupancy 8/8 = 100% → 200×; prize = 200 × R$20 = R$4000 = 400000 cents,
    // but capped at collected 16000. Winner share (NONE) = 25% of 16000 = 4000.
    expect(result.occupancy).toBe(1);
    expect(result.multiplier).toBe(200);
    expect(result.collectedCents).toBe(16000n);
    expect(result.prizePoolCents).toBe(16000n); // capped at collected
    expect(result.winnerCents).toBe(4000n); // 25%
    expect(result.houseCents).toBe(12000n);

    expect(await balanceOf(winner)).toBe(4000n);
    expect(await systemBalance('PRIZE_POOL')).toBe(0n); // escrow emptied
    expect(await systemBalance('HOUSE_RAKE')).toBe(12000n);

    const all = await prisma.ledgerEntry.aggregate({ _sum: { amountCents: true } });
    expect(all._sum.amountCents).toBe(0n); // whole-system conservation
  });

  it('annual subscriber winner takes the full capped prize', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 8; i++) {
      const u = await fundedUser(2000n);
      ids.push(u);
      await tourn.escrowEntry({ tournamentId: 't5', userId: u, level: 1, subscription: 'NONE' });
    }
    const result = await tourn.settle({
      tournamentId: 't5',
      level: 1,
      winnerId: ids[3],
      winnerSubscription: 'ANNUAL', // 100% share
      participants: ids.map((id) => ({ userId: id, subscription: 'NONE' as Subscription })),
    });
    expect(result.winnerCents).toBe(16000n); // 100% of the capped pool
    expect(result.houseCents).toBe(0n);
    expect(await balanceOf(ids[3])).toBe(16000n);
  });

  it('phase-1 room capacity is 8 (table-as-room)', () => {
    expect(PHASE1_ROOM_CAPACITY).toBe(8);
  });
});
