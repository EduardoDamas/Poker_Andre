import { MultiTableCoordinator } from './multi-table-coordinator';
import { MttTable } from './multi-table';

const roster = (n: number): string[] => Array.from({ length: n }, (_, i) => `p${i}`);

describe('MultiTableCoordinator', () => {
  it('announces the first round on construction', () => {
    const rounds: number[] = [];
    const c = new MultiTableCoordinator('cup', roster(80), {
      onRoundReady: (_t, round) => rounds.push(round),
    });
    expect(rounds).toEqual([1]);
    expect(c.currentTables).toHaveLength(10);
    expect(c.round).toBe(1);
  });

  it('advances only once every table in the round has reported', () => {
    let roundReadyCount = 0;
    const c = new MultiTableCoordinator('cup', roster(80), {
      onRoundReady: () => (roundReadyCount += 1),
    });
    const tables = [...c.currentTables];

    // Report 9 of 10 → still round 1, no new round announced.
    for (let i = 0; i < 9; i++) c.reportTableWinner(tables[i].id, tables[i].players[0]);
    expect(c.round).toBe(1);
    expect(roundReadyCount).toBe(1); // only the initial round
    expect(c.pendingTables()).toEqual([tables[9].id]);

    // The 10th completes the round → advances to round 2.
    c.reportTableWinner(tables[9].id, tables[9].players[0]);
    expect(c.round).toBe(2);
    expect(roundReadyCount).toBe(2);
  });

  it('drives a full field to a champion, firing onChampion once', () => {
    const champions: string[] = [];
    let readies = 0;
    const c = new MultiTableCoordinator('cup', roster(80), {
      onRoundReady: () => (readies += 1),
      onChampion: (id) => champions.push(id),
    });

    let guard = 0;
    while (!c.isComplete && guard++ < 50) {
      for (const t of [...c.currentTables]) c.reportTableWinner(t.id, t.players[0]);
    }

    expect(c.isComplete).toBe(true);
    expect(champions).toEqual(['p0']); // p0 keeps the first seat every round
    expect(c.champion).toBe('p0');
    expect(readies).toBeGreaterThan(1); // several rounds were announced
  });

  it('tableOf locates a player in the current round', () => {
    const c = new MultiTableCoordinator('cup', roster(80));
    const t = c.tableOf('p5') as MttTable;
    expect(t).toBeDefined();
    expect(t.players).toContain('p5');
  });

  it('guards against bad reports', () => {
    const c = new MultiTableCoordinator('cup', roster(80));
    const first = c.currentTables[0];
    expect(() => c.reportTableWinner('nope', first.players[0])).toThrow();
    expect(() => c.reportTableWinner(first.id, 'not-seated')).toThrow();
    c.reportTableWinner(first.id, first.players[0]);
    expect(() => c.reportTableWinner(first.id, first.players[0])).toThrow(); // double report
  });
});
