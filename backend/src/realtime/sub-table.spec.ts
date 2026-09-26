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
  // Found by the app end-to-end run (2026-09-25): a hand where every player is
  // all-in from the blinds is over the moment it is dealt; nobody can act, so
  // it was never booked and the table (and a whole bracket) waited forever.
  it('a hand that is over as dealt (all-in from the blinds) is still booked — the table never stalls', async () => {
    const id = 'dealt-over-t1';
    const table = tables.enableTournament(id, 0, 8, { subTable: true });
    tables.recordTournamentEntry(table, 'a', 'NONE');
    tables.recordTournamentEntry(table, 'b', 'NONE');
    table.tournament!.handsPlayed = 30; // deep in the escalation: blinds far above both stacks

    expect(tables.startHand(table)).toBe(true);
    expect(table.hand!.actingPlayerId).toBeNull(); // nobody can act on it
    let result = await tables.completeDealtHand(id);
    expect(result).not.toBeNull();
    expect(table.handInProgress).toBe(false);

    // Every following hand is the same; the table still plays to one winner.
    let guard = 0;
    while (!result!.tournament!.over && guard++ < 100) {
      expect(tables.startHand(table)).toBe(true);
      result = await tables.completeDealtHand(id);
    }
    expect(result!.tournament!.over).toBe(true);
    expect(['a', 'b']).toContain(result!.tournament!.winnerId);
  });

  it('a hand still being played is left alone', async () => {
    const id = 'dealt-live-t1';
    const table = tables.enableTournament(id, 0, 8, { subTable: true });
    tables.recordTournamentEntry(table, 'a', 'NONE');
    tables.recordTournamentEntry(table, 'b', 'NONE');
    expect(tables.startHand(table)).toBe(true);
    expect(await tables.completeDealtHand(id)).toBeNull();
    expect(table.handInProgress).toBe(true);
  });
});
