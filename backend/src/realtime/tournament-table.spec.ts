import { PrismaClient } from '@prisma/client';
import { LedgerService } from '../wallet/ledger.service';
import { WalletService } from '../wallet/wallet.service';
import { SettlementService } from '../wallet/settlement.service';
import { TournamentService } from '../tournament/tournament.service';
import { TableService } from './table.service';
import { PrismaService } from '../prisma/prisma.service';
import { resetDb } from '../test-utils/reset-db';

/**
 * Single-table elimination tournament wired into the realtime layer:
 * entry escrowed on join, chip stacks carried across hands, last player
 * standing paid the money prize. Heads-up (2 players) plays to a winner.
 */
describe('TableService tournament mode', () => {
  let prisma: PrismaClient;
  let wallet: WalletService;
  let ledger: LedgerService;
  let tournament: TournamentService;
  let tables: TableService;
  let counter = 0;

  beforeAll(() => {
    prisma = new PrismaClient();
    ledger = new LedgerService(prisma as unknown as PrismaService);
    wallet = new WalletService(prisma as unknown as PrismaService, ledger);
    const settlement = new SettlementService(prisma as unknown as PrismaService, ledger, wallet);
    tournament = new TournamentService(prisma as unknown as PrismaService, ledger, wallet);
    tables = new TableService(settlement, tournament);
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
        phone: `+5511977700${counter.toString().padStart(3, '0')}`,
        displayName: `TT${counter}`,
        cpf: `7000000000${counter.toString().padStart(2, '0')}`,
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

  // Drive a heads-up tournament to completion. Players shove all-in whenever
  // they can, so a bust-out (and thus a winner) happens within a few hands.
  async function playToEnd(tableId: string): Promise<{ winnerId?: string; prizeCents?: number }> {
    let guard = 0;
    let last: { winnerId?: string; prizeCents?: number } = {};
    while (guard++ < 5000) {
      const table = tables.getTable(tableId)!;
      if (!table.handInProgress) {
        if (!tables.startHand(table)) break; // tournament over (or can't start)
      }
      const hand = table.hand!;
      const acting = hand.actingPlayerId;
      if (!acting) break;
      const legal = hand.legalActions();
      let action: { type: string; amount?: number };
      if (legal.includes('bet')) {
        action = { type: 'bet', amount: hand.actingStack }; // shove
      } else if (legal.includes('raise')) {
        action = { type: 'raise', amount: hand.actingCommitted + hand.actingStack }; // all-in raise
      } else if (legal.includes('call')) {
        action = { type: 'call' };
      } else if (legal.includes('check')) {
        action = { type: 'check' };
      } else {
        action = { type: 'fold' };
      }
      let res;
      try {
        res = await tables.act(tableId, acting, action as never);
      } catch {
        res = await tables.act(tableId, acting, { type: 'call' } as never).catch(() =>
          tables.act(tableId, acting, { type: 'check' } as never),
        );
      }
      if (res && res.complete && res.result.tournament?.over) {
        last = {
          winnerId: res.result.tournament.winnerId,
          prizeCents: res.result.tournament.prizeCents,
        };
        break;
      }
    }
    return last;
  }

  it('escrows entry, plays heads-up to a winner, pays the prize, conserves money', async () => {
    const a = await fundedUser(5000n); // R$50
    const b = await fundedUser(5000n);

    const tableId = 'tourn-test-1';
    const table = tables.enableTournament(tableId, 1); // level 1 → entry R$20
    tables.join(tableId, a, 'sockA');
    tables.join(tableId, b, 'sockB');

    // Escrow both entries (gateway does this; here we call directly).
    await tournament.escrowEntry({ tournamentId: tableId, userId: a, level: 1, subscription: 'NONE' });
    tables.recordTournamentEntry(table, a, 'NONE');
    await tournament.escrowEntry({ tournamentId: tableId, userId: b, level: 1, subscription: 'NONE' });
    tables.recordTournamentEntry(table, b, 'NONE');

    expect(await balanceOf(a)).toBe(3000n); // R$50 − R$20
    expect(await balanceOf(b)).toBe(3000n);

    const { winnerId, prizeCents } = await playToEnd(tableId);
    expect(winnerId === a || winnerId === b).toBe(true);

    // 2/8 occupancy = 25% → 40× multiplier; prize raw = 40 × R$20 = R$800,
    // capped at collected R$40 = 4000 cents. Winner (NONE) share = 25% = 1000.
    expect(prizeCents).toBe(1000);

    const loser = winnerId === a ? b : a;
    expect(await balanceOf(winnerId!)).toBe(4000n); // 3000 left + 1000 prize
    expect(await balanceOf(loser)).toBe(3000n);

    // Whole-system money conservation.
    const all = await prisma.ledgerEntry.aggregate({ _sum: { amountCents: true } });
    expect(all._sum.amountCents).toBe(0n);
  });

  it('does not start a tournament with fewer than 2 entrants', async () => {
    const a = await fundedUser(5000n);
    const tableId = 'tourn-test-2';
    const table = tables.enableTournament(tableId, 1);
    tables.join(tableId, a, 'sockA');
    await tournament.escrowEntry({ tournamentId: tableId, userId: a, level: 1, subscription: 'NONE' });
    tables.recordTournamentEntry(table, a, 'NONE');

    expect(tables.tournamentReadyToStart(table)).toBe(false);
    expect(tables.startHand(table)).toBe(false);
  });
});
