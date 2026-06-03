import { buildSidePots, totalPot } from './side-pots';

/**
 * STEP C4 gate — side-pot construction.
 * Core invariant: Σ pots + Σ refunds == Σ contributions (chip conservation).
 */
describe('buildSidePots', () => {
  const sum = (c: Record<string, number>) => Object.values(c).reduce((a, b) => a + b, 0);
  const sumRefunds = (r: Record<string, number>) =>
    Object.values(r).reduce((a, b) => a + b, 0);

  it('single pot when everyone contributes equally', () => {
    const c = { p0: 20, p1: 20, p2: 20 };
    const { pots, refunds } = buildSidePots(c, []);
    expect(pots).toHaveLength(1);
    expect(pots[0].amount).toBe(60);
    expect(pots[0].eligiblePlayerIds.sort()).toEqual(['p0', 'p1', 'p2']);
    expect(refunds).toEqual({});
    expect(totalPot(pots)).toBe(sum(c));
  });

  it('one short all-in creates a main pot + a side pot', () => {
    const c = { p0: 100, p1: 100, p2: 40 };
    const { pots, refunds } = buildSidePots(c, []);
    expect(totalPot(pots) + sumRefunds(refunds)).toBe(sum(c)); // 240, conserved
    expect(refunds).toEqual({}); // top is tied (p0,p1) — nothing uncalled

    expect(pots[0].amount).toBe(120); // main: 40*3
    expect(pots[0].eligiblePlayerIds.sort()).toEqual(['p0', 'p1', 'p2']);
    expect(pots[1].amount).toBe(120); // side: 60*2
    expect(pots[1].eligiblePlayerIds.sort()).toEqual(['p0', 'p1']);
  });

  it('refunds an uncalled bet (lone top contributor)', () => {
    // p0 bet 100; p1 could only call all-in for 60. p0's top 40 is uncalled.
    const c = { p0: 100, p1: 60 };
    const { pots, refunds } = buildSidePots(c, []);
    expect(refunds).toEqual({ p0: 40 });
    expect(pots).toHaveLength(1);
    expect(pots[0].amount).toBe(120); // 60 each, contestable by both
    expect(pots[0].eligiblePlayerIds.sort()).toEqual(['p0', 'p1']);
    expect(totalPot(pots) + sumRefunds(refunds)).toBe(sum(c)); // 160
  });

  it('three stacked all-ins create three pots', () => {
    const c = { p0: 30, p1: 60, p2: 100, p3: 100 };
    const { pots, refunds } = buildSidePots(c, []);
    expect(refunds).toEqual({});
    expect(totalPot(pots)).toBe(sum(c)); // 290
    expect(pots[0]).toEqual({ amount: 120, eligiblePlayerIds: ['p0', 'p1', 'p2', 'p3'] });
    expect(pots[1]).toEqual({ amount: 90, eligiblePlayerIds: ['p1', 'p2', 'p3'] });
    expect(pots[2]).toEqual({ amount: 80, eligiblePlayerIds: ['p2', 'p3'] });
  });

  it("folded players' chips stay in the pot but they can't win it", () => {
    const c = { p0: 50, p1: 100, p2: 100 };
    const { pots, refunds } = buildSidePots(c, ['p0']);
    expect(refunds).toEqual({}); // top tied p1/p2
    expect(totalPot(pots)).toBe(sum(c)); // 250
    expect(pots).toHaveLength(1); // eligibility {p1,p2} throughout → merged
    expect(pots[0].amount).toBe(250);
    expect(pots[0].eligiblePlayerIds.sort()).toEqual(['p1', 'p2']);
  });

  it('conserves chips across many mixed scenarios', () => {
    const scenarios: Array<[Record<string, number>, string[]]> = [
      [{ a: 10, b: 10 }, []],
      [{ a: 5, b: 10, c: 10 }, []],
      [{ a: 5, b: 10, c: 15, d: 20 }, ['b']],
      [{ a: 100, b: 100, c: 100, d: 1 }, ['d']],
      [{ a: 7, b: 3, c: 3 }, ['a']], // a is a lone top contributor → refund
    ];
    for (const [c, folded] of scenarios) {
      const { pots, refunds } = buildSidePots(c, folded);
      expect(totalPot(pots) + sumRefunds(refunds)).toBe(sum(c));
      // Every pot has at least one eligible player.
      pots.forEach((p) => expect(p.eligiblePlayerIds.length).toBeGreaterThan(0));
    }
  });

  it('ignores zero contributions and returns nothing for an empty hand', () => {
    expect(buildSidePots({ a: 0, b: 0 }, [])).toEqual({ pots: [], refunds: {} });
    expect(buildSidePots({}, [])).toEqual({ pots: [], refunds: {} });
  });
});
