import { PrismaClient } from '@prisma/client';
import { LedgerService } from '../wallet/ledger.service';
import { WalletService } from '../wallet/wallet.service';
import { SettlementService } from '../wallet/settlement.service';
import { TournamentService } from '../tournament/tournament.service';
import { PrismaService } from '../prisma/prisma.service';
import { resetDb } from '../test-utils/reset-db';
import { MultiTableTournamentService } from './multi-table.service';

/**
 * Multi-table tournament money flow: escrow every entry, run the bracket to a
 * champion, settle one prize by occupancy, and conserve money end to end.
 */
describe('MultiTableTournamentService money flow', () => {
  let prisma: PrismaClient;
  let wallet: WalletService;
  let ledger: LedgerService;
  let tournament: TournamentService;
  let mtt: MultiTableTournamentService;
  let counter = 0;

  beforeAll(() => {
    prisma = new PrismaClient();
    ledger = new LedgerService(prisma as unknown as PrismaService);
    wallet = new WalletService(prisma as unknown as PrismaService, ledger);
    new SettlementService(prisma as unknown as PrismaService, ledger, wallet); // wiring parity
    tournament = new TournamentService(prisma as unknown as PrismaService, ledger, wallet);
    mtt = new MultiTableTournamentService(tournament);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
  });

  async function fundedUser(cents: bigint): Promise<string> {
    counter += 1;
    const u = await prisma.user.create({
      data: {
        phone: `+55119${counter.toString().padStart(8, '0')}`,
        displayName: `MT${counter}`,
        cpf: `9${counter.toString().padStart(10, '0')}`,
        birthDate: new Date('1990-01-01'),
      },
    });
    await wallet.deposit(u.id, cents);
    return u.id;
  }

  async function balanceOf(userId: string): Promise<bigint> {
    const acc = await prisma.account.findUnique({ where: { userId } });
    return acc ? ledger.balanceOf(acc.id) : 0n;
  }

  it('runs 80 entrants to a champion, pays the occupancy prize, conserves money', async () => {
    // Level 1 entry (V.I.) is R$20 = 2000 cents; fund each player exactly that.
    const ENTRY = 2000n;
    const ids: string[] = [];
    for (let i = 0; i < 80; i++) ids.push(await fundedUser(ENTRY));

    const participants = ids.map((userId) => ({ userId, subscription: 'NONE' as const }));

    const { championId, payout, rounds } = await mtt.run({
      tournamentId: 'mtt-1',
      level: 1,
      participants,
      resolveTable: (players) => players[0], // deterministic: first seat wins
    });

    // 80 / 800 seats = 10% occupancy → 20× multiplier.
    // prize = 20 × R$20 = R$400 (40000c), capped at collected R$1600. Winner
    // (NONE) share = 25% = R$100 (10000c); the rest is house.
    expect(rounds).toBeGreaterThan(1);
    expect(ids).toContain(championId);
    expect(championId).toBe(ids[0]); // first-seeded survives every round
    expect(payout.multiplier).toBe(20);
    expect(payout.collectedCents).toBe(160000n); // 80 × 2000
    expect(payout.winnerCents).toBe(10000n); // R$100

    // Champion ends with the prize; everyone else with nothing.
    expect(await balanceOf(championId)).toBe(10000n);
    let players = 0n;
    for (const id of ids) players += await balanceOf(id);
    expect(players).toBe(10000n); // only the champion holds a balance

    // Whole-system money conservation (every ledger entry sums to zero).
    const all = await prisma.ledgerEntry.aggregate({ _sum: { amountCents: true } });
    expect(all._sum.amountCents).toBe(0n);
  });
});
