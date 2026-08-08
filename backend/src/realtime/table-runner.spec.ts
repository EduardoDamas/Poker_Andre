import { playTableWithBots, playTableToWinner } from './table-runner';
import { MultiTableTournament } from '../tournament/multi-table';

const seats = (n: number): string[] => Array.from({ length: n }, (_, i) => `s${i}`);

describe('table-runner — single-table elimination', () => {
  it('an 8-player bot table resolves to exactly one winner holding every chip', () => {
    const { winnerId, handsPlayed, finalStacks } = playTableWithBots(seats(8));
    const total = 8 * 1000;

    expect(seats(8)).toContain(winnerId);
    expect(handsPlayed).toBeGreaterThan(0);
    expect(finalStacks[winnerId]).toBe(total); // winner has all the chips
    expect(Object.values(finalStacks).reduce((a, b) => a + b, 0)).toBe(total); // conserved
    expect(Object.values(finalStacks).filter((s) => s > 0)).toHaveLength(1);
  });

  it('plays heads-up to a winner', () => {
    const { winnerId, finalStacks } = playTableWithBots(seats(2));
    expect(finalStacks[winnerId]).toBe(2000);
  });

  it('a single-seat table is trivially its own winner', () => {
    const r = playTableToWinner(['solo'], () => ({ type: 'fold' }));
    expect(r.winnerId).toBe('solo');
    expect(r.handsPlayed).toBe(0);
  });
});

describe('multi-table shootout — full run with bots (end to end)', () => {
  it('drives a whole field down to a single champion', () => {
    // Small field (minPlayers override) so the test stays fast but plays real hands.
    const field = seats(24);
    const t = new MultiTableTournament('cup', field, { minPlayers: 16 });

    let guard = 0;
    while (!t.isComplete && guard++ < 50) {
      const winners: Record<string, string> = {};
      for (const table of t.tables) {
        winners[table.id] = playTableWithBots(table.players).winnerId;
      }
      t.advance(winners);
    }

    expect(t.isComplete).toBe(true);
    expect(t.aliveCount).toBe(1);
    expect(field).toContain(t.champion);
    expect(t.round).toBeGreaterThan(1); // multiple rounds happened
  });
});
