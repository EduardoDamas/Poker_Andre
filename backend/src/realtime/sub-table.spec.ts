import { PrismaClient } from '@prisma/client';
import { LedgerService } from '../wallet/ledger.service';
import { WalletService } from '../wallet/wallet.service';
import { SettlementService } from '../wallet/settlement.service';
import { TournamentService } from '../tournament/tournament.service';
import { TableService } from './table.service';
import { PrismaService } from '../prisma/prisma.service';
import { resetDb } from '../test-utils/reset-db';

/**
 * Sub-table mode: a table of a multi-table tournament plays to ONE winner in
 * chips, but settles NO money (the prize is paid once, for the champion). This
 * verifies a sub-table resolves to a winner and never touches the ledger.
 */
describe('TableService sub-table (multi-table) mode', () => {
  let prisma: PrismaClient;
  let tables: TableService;

  beforeAll(() => {
    prisma = new PrismaClient();
    const ledger = new LedgerService(prisma as unknown as PrismaService);
    const wallet = new WalletService(prisma as unknown as PrismaService, ledger);
    const settlement = new SettlementService(prisma as unknown as PrismaService, ledger, wallet);
    const tournament = new TournamentService(prisma as unknown as PrismaService, ledger, wallet);
    tables = new TableService(settlement, tournament);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
  });

  // Drive a sub-table to completion: everyone shoves so it resolves quickly.
  async function playToEnd(tableId: string): Promise<{ over: boolean; winnerId?: string; prizeCents?: number }> {
    let guard = 0;
    let last: { over: boolean; winnerId?: string; prizeCents?: number } = { over: false };
    while (guard++ < 5000) {
      const table = tables.getTable(tableId)!;
      if (!table.handInProgress && !tables.startHand(table)) break;
      const hand = table.hand!;
      const acting = hand.actingPlayerId;
      if (!acting) break;
      const legal = hand.legalActions();
      const action = legal.includes('bet')
        ? { type: 'bet', amount: hand.actingStack }
        : legal.includes('raise')
          ? { type: 'raise', amount: hand.actingCommitted + hand.actingStack }
          : legal.includes('call')
            ? { type: 'call' }
            : legal.includes('check')
              ? { type: 'check' }
              : { type: 'fold' };
      let res;
      try {
        res = await tables.act(tableId, acting, action as never);
      } catch {
        res = await tables
          .act(tableId, acting, { type: 'call' } as never)
          .catch(() => tables.act(tableId, acting, { type: 'check' } as never));
      }
      if (res && res.complete && res.result.tournament?.over) {
        last = {
          over: true,
          winnerId: res.result.tournament.winnerId,
          prizeCents: res.result.tournament.prizeCents,
        };
        break;
      }
    }
    return last;
  }

  it('resolves to one winner and moves no money', async () => {
    const tableId = 'sub-1';
    const table = tables.enableTournament(tableId, 1, 8, { subTable: true });
    const players = Array.from({ length: 8 }, (_, i) => `p${i}`);
    for (const id of players) tables.recordTournamentEntry(table, id, 'NONE');

    const { over, winnerId, prizeCents } = await playToEnd(tableId);

    expect(over).toBe(true);
    expect(players).toContain(winnerId);
    expect(prizeCents).toBeUndefined(); // no settlement at the sub-table

    // The ledger was never touched (no escrow, no payout).
    const entries = await prisma.ledgerEntry.count();
    expect(entries).toBe(0);
  });
});
