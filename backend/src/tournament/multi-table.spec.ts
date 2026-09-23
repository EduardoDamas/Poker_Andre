import {
  MultiTableTournament,
  seatIntoTables,
  canStart,
  pickFullestRoom,
  MIN_PLAYERS,
  MAX_PLAYERS,
  SEATS_PER_TABLE,
} from './multi-table';

const roster = (n: number): string[] => Array.from({ length: n }, (_, i) => `p${i}`);

describe('multi-table tournament — structure', () => {
  describe('canStart', () => {
    it('needs at least 10 full tables (80 players) and at most 800', () => {
      expect(canStart(79)).toBe(false);
      expect(canStart(80)).toBe(true);
      expect(canStart(800)).toBe(true);
      expect(canStart(801)).toBe(false);
    });
  });

  describe('seatIntoTables', () => {
    it('splits 80 players into 10 tables of 8', () => {
      const tables = seatIntoTables(roster(80), 1, 't');
      expect(tables).toHaveLength(10);
      expect(tables.every((t) => t.players.length === 8)).toBe(true);
    });

    it('balances uneven counts (137 → 18 tables, sizes differ by ≤1, no table > 8)', () => {
      const tables = seatIntoTables(roster(137), 1, 't');
      expect(tables).toHaveLength(Math.ceil(137 / SEATS_PER_TABLE)); // 18
      const sizes = tables.map((t) => t.players.length);
      expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
      expect(Math.max(...sizes)).toBeLessThanOrEqual(SEATS_PER_TABLE);
      expect(sizes.reduce((a, b) => a + b, 0)).toBe(137);
    });

    // Client, 2026-09-22: 80 is an estimate, more may come. Up to 100 still
    // leaves exactly 10 winners for one final table.
    it.each([81, 88, 90, 97, 100])('keeps %i players on 10 tables of 9–10', (n) => {
      const tables = seatIntoTables(roster(n), 1, 't');
      expect(tables).toHaveLength(10);
      const sizes = tables.map((t) => t.players.length);
      expect(Math.max(...sizes)).toBeLessThanOrEqual(10);
      expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
      expect(sizes.reduce((a, b) => a + b, 0)).toBe(n);
    });

    it('a 100-player field reaches a final table of 10', () => {
      const t = new MultiTableTournament('t', roster(100), { minPlayers: 2 });
      t.advance(Object.fromEntries(t.tables.map((tb) => [tb.id, tb.players[0]])));
      expect(t.tables).toHaveLength(1);
      expect(t.tables[0].players).toHaveLength(10);
    });

    it('fills the max at 800 players (100 tables of 8)', () => {
      const tables = seatIntoTables(roster(MAX_PLAYERS), 1, 't');
      expect(tables).toHaveLength(100);
      expect(tables.every((t) => t.players.length === 8)).toBe(true);
    });

    it('seats every player exactly once', () => {
      const tables = seatIntoTables(roster(237), 2, 't');
      const seated = tables.flatMap((t) => t.players);
      expect(new Set(seated).size).toBe(237);
    });
  });

  describe('construction guards', () => {
    it('rejects fewer than the minimum', () => {
      expect(() => new MultiTableTournament('t', roster(MIN_PLAYERS - 1))).toThrow();
    });
    it('rejects more than the maximum', () => {
      expect(() => new MultiTableTournament('t', roster(MAX_PLAYERS + 1))).toThrow();
    });
    it('rejects duplicate players', () => {
      expect(() => new MultiTableTournament('t', ['a', 'b', 'a'], { minPlayers: 2 })).toThrow();
    });
  });

  describe('running to a champion', () => {
    // Always crown the first-seated player of each table.
    function runPickingFirst(t: MultiTableTournament): string {
      let guard = 0;
      while (!t.isComplete && guard++ < 100) {
        const winners: Record<string, string> = {};
        for (const table of t.tables) winners[table.id] = table.players[0];
        t.advance(winners);
      }
      return t.champion!;
    }

    it('80 players → shrinks each round to a single champion', () => {
      const t = new MultiTableTournament('cup', roster(80));
      expect(t.round).toBe(1);
      expect(t.tables).toHaveLength(10);

      const champion = runPickingFirst(t);
      expect(t.isComplete).toBe(true);
      expect(t.aliveCount).toBe(1);
      expect(roster(80)).toContain(champion);
      expect(champion).toBe('p0'); // p0 survives as first seat every round
      expect(t.round).toBeGreaterThan(1); // took multiple rounds
    });

    it('a full 800-player field resolves to exactly one champion', () => {
      const t = new MultiTableTournament('big', roster(MAX_PLAYERS));
      const champion = runPickingFirst(t);
      expect(t.isComplete).toBe(true);
      expect(t.aliveCount).toBe(1);
      expect(roster(MAX_PLAYERS)).toContain(champion);
    });
  });

  describe('advance guards', () => {
    it('rejects a missing table winner', () => {
      const t = new MultiTableTournament('t', roster(80));
      expect(() => t.advance({})).toThrow();
    });
    it('rejects a winner not seated at the table', () => {
      const t = new MultiTableTournament('t', roster(80));
      const winners: Record<string, string> = {};
      for (const table of t.tables) winners[table.id] = table.players[0];
      const firstId = t.tables[0].id;
      winners[firstId] = 'not-a-player';
      expect(() => t.advance(winners)).toThrow();
    });
  });

  describe('pickFullestRoom (auto-join)', () => {
    it('routes to the fullest joinable, not-started room', () => {
      const rooms = [
        { id: 'a', waiting: 3, capacity: 800, started: false },
        { id: 'b', waiting: 7, capacity: 800, started: false },
        { id: 'c', waiting: 800, capacity: 800, started: false }, // full
        { id: 'd', waiting: 50, capacity: 800, started: true }, // started
      ];
      expect(pickFullestRoom(rooms)).toBe('b');
    });
    it('returns null when nothing is joinable', () => {
      expect(pickFullestRoom([{ id: 'x', waiting: 800, capacity: 800, started: false }])).toBeNull();
      expect(pickFullestRoom([])).toBeNull();
    });
  });
});
