import { MultiTableTournament, seatIntoTables, FINAL_TABLE_SEATS } from './multi-table';
import { PokerHand } from '../poker/hand';
import { TableService } from '../realtime/table.service';
import { SettlementService } from '../wallet/settlement.service';
import { TournamentService } from './tournament.service';

/**
 * The client's promotion format (2026-09-22): 10 tables of 8; each table plays
 * down to one; the 10 winners meet at a single final table; one champion.
 */
describe('10-seat final table', () => {
  const roster = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);

  describe('bracket', () => {
    it('80 players start at 10 tables of 8', () => {
      const tables = seatIntoTables(roster(80), 1, 'promo');
      expect(tables).toHaveLength(10);
      expect(tables.every((t) => t.players.length === 8)).toBe(true);
    });

    it('the 10 table winners play ONE final table, not two', () => {
      const tables = seatIntoTables(roster(10), 2, 'promo');
      expect(tables).toHaveLength(1);
      expect(tables[0].players).toHaveLength(10);
    });

    it('fewer finalists still share one table', () => {
      for (const n of [2, 5, 7, 9]) {
        expect(seatIntoTables(roster(n), 2, 'promo')).toHaveLength(1);
      }
    });

    it('just above the final-table size splits again', () => {
      const tables = seatIntoTables(roster(FINAL_TABLE_SEATS + 1), 2, 'promo');
      expect(tables).toHaveLength(2);
      expect(tables.every((t) => t.players.length <= 8)).toBe(true);
    });

    it('80 players reach a champion in exactly two phases', () => {
      const t = new MultiTableTournament('promo', roster(80));
      expect(t.round).toBe(1);
      expect(t.tables).toHaveLength(10);

      // Phase 1: each table's first player wins it.
      t.advance(Object.fromEntries(t.tables.map((tb) => [tb.id, tb.players[0]])));
      expect(t.round).toBe(2);
      expect(t.tables).toHaveLength(1); // the final table
      expect(t.tables[0].players).toHaveLength(10);

      // Phase 2: the final table.
      const final = t.tables[0];
      t.advance({ [final.id]: final.players[3] });
      expect(t.isComplete).toBe(true);
      expect(t.champion).toBe(final.players[3]);
    });

    it('a smaller turnout (40) plays 5 tables, then a final of 5', () => {
      const t = new MultiTableTournament('promo', roster(40), { minPlayers: 16 });
      expect(t.tables).toHaveLength(5);
      t.advance(Object.fromEntries(t.tables.map((tb) => [tb.id, tb.players[0]])));
      expect(t.tables).toHaveLength(1);
      expect(t.tables[0].players).toHaveLength(5);
    });
  });

  describe('a 10-handed hand plays to the end', () => {
    it('deals, bets and settles with ten players, chips conserved', () => {
      const seats = roster(10).map((id) => ({ id, stack: 1000 }));
      const hand = new PokerHand(seats, { smallBlind: 10, bigBlind: 20 });

      // Everyone calls/checks down to showdown.
      let guard = 0;
      while (!hand.isComplete() && guard++ < 500) {
        const actor = hand.actingPlayerId!;
        const legal = hand.legalActions();
        hand.act(actor, { type: legal.includes('check') ? 'check' : 'call' });
      }

      expect(hand.isComplete()).toBe(true);
      const result = hand.result();
      const total = Object.values(result.finalStacks).reduce((a, b) => a + b, 0);
      expect(total).toBe(10 * 1000);
    });
  });

  describe('seat guard', () => {
    const svc = () =>
      new TableService(
        {} as unknown as SettlementService,
        {} as unknown as TournamentService,
      );

    it('a lobby room stays at 8 seats even if a client asks for 10', () => {
      const tables = svc();
      const { table } = tables.join('poker-l1', 'u1', 's1', 10);
      expect(table.maxSeats).toBe(8);
    });

    it('a server-created final table may seat 10', () => {
      const tables = svc();
      const table = tables.enableTournament('promo-r2-t1', 0, 10, { subTable: true });
      expect(table.maxSeats).toBe(10);
      expect(table.seats).toHaveLength(10);
    });

    it('a tournament room opened by a client join still caps at 8', () => {
      const tables = svc();
      const table = tables.enableTournament('poker-l2', 2, 10);
      expect(table.maxSeats).toBe(8);
    });

    it('never more than 10, even for server tables', () => {
      const tables = svc();
      const table = tables.enableTournament('promo-r2-t9', 0, 12, { subTable: true });
      expect(table.maxSeats).toBe(10);
    });
  });
});
