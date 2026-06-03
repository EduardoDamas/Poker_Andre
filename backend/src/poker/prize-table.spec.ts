import {
  multiplierFor,
  computePrizePool,
  distributePrize,
  DEFAULT_PRIZE_TIERS,
} from './prize-table';

/**
 * STEP G1 gate — prize-table math & invariants.
 * Tier values are the real CAPACONTEST.pdf table (see docs/PRIZE_RULES.md).
 */
describe('prize table', () => {
  describe('multiplierFor (occupancy → multiplier)', () => {
    it('full room pays the top multiplier (200×)', () => {
      expect(multiplierFor(1.0)).toBe(200);
    });
    it('below 10% occupancy → no prize (0×); 10–19% → floor 20×', () => {
      expect(multiplierFor(0)).toBe(0);
      expect(multiplierFor(0.05)).toBe(0);
      expect(multiplierFor(0.1)).toBe(20);
      expect(multiplierFor(0.15)).toBe(20);
    });
    it('picks the right band for mid occupancy (per the PDF table)', () => {
      expect(multiplierFor(0.5)).toBe(100); // 50–59%
      expect(multiplierFor(0.85)).toBe(160); // 80–89%
      expect(multiplierFor(0.99)).toBe(180); // 90–99%, below exact-full
    });
    it('is monotonic non-decreasing in occupancy', () => {
      let prev = -1;
      for (let occ = 0; occ <= 1.0001; occ += 0.05) {
        const m = multiplierFor(Math.min(occ, 1));
        expect(m).toBeGreaterThanOrEqual(prev);
        prev = m;
      }
    });
  });

  describe('computePrizePool', () => {
    const entry = 1000n; // R$10,00 entry (V.I.)

    it('full 800-seat room: prize = 200×V.I., rest is rake', () => {
      const pool = computePrizePool({ entryValueCents: entry, capacity: 800, participants: 800 });
      expect(pool.multiplier).toBe(200);
      expect(pool.collectedCents).toBe(800000n); // 800 × 1000
      expect(pool.prizeCents).toBe(200000n); // 200 × 1000
      expect(pool.rakeCents).toBe(600000n);
    });

    it('below 10% occupancy → no prize awarded (flagged), all collected is rake', () => {
      // 10 of 800 = 1.25% occupancy → multiplier 0.
      const pool = computePrizePool({ entryValueCents: entry, capacity: 800, participants: 10 });
      expect(pool.prizeAwarded).toBe(false);
      expect(pool.prizeCents).toBe(0n);
      expect(pool.rakeCents).toBe(pool.collectedCents);
    });

    it('caps the prize at the collected amount (money-safety in a small room)', () => {
      // Small room: 15 of 100 = 15% → 20×V.I. = 20000, but only 15000 collected.
      const pool = computePrizePool({ entryValueCents: entry, capacity: 100, participants: 15 });
      expect(pool.multiplier).toBe(20);
      expect(pool.collectedCents).toBe(15000n);
      expect(pool.prizeCents).toBe(15000n); // capped, never overpay
      expect(pool.rakeCents).toBe(0n);
    });

    it('prize + rake always equals collected (conservation)', () => {
      for (const participants of [1, 50, 160, 400, 560, 680, 800]) {
        const pool = computePrizePool({ entryValueCents: entry, capacity: 800, participants });
        expect(pool.prizeCents + pool.rakeCents).toBe(pool.collectedCents);
        expect(pool.prizeCents).toBeLessThanOrEqual(pool.collectedCents);
      }
    });

    it('rejects invalid inputs', () => {
      expect(() => computePrizePool({ entryValueCents: entry, capacity: 0, participants: 0 })).toThrow();
      expect(() => computePrizePool({ entryValueCents: entry, capacity: 10, participants: 11 })).toThrow();
    });

    it('has 11 bands: the 10 PDF payout rows + the below-10% floor', () => {
      expect(DEFAULT_PRIZE_TIERS).toHaveLength(11);
      // Sanity-check the full-room and floor rows against the PDF.
      expect(DEFAULT_PRIZE_TIERS.find((t) => t.minOccupancy === 1.0)?.multiplier).toBe(200);
      expect(DEFAULT_PRIZE_TIERS.find((t) => t.minOccupancy === 0.1)?.multiplier).toBe(20);
    });
  });

  describe('distributePrize', () => {
    it('single winner takes the whole prize', () => {
      expect(distributePrize(50000n, [1])).toEqual([50000n]);
    });
    it('splits by weights exactly when divisible', () => {
      expect(distributePrize(10000n, [70, 20, 10])).toEqual([7000n, 2000n, 1000n]);
    });
    it('gives remainder cents to the top places', () => {
      // 101 split three ways → 34/34/33
      expect(distributePrize(101n, [1, 1, 1])).toEqual([34n, 34n, 33n]);
    });
    it('always sums exactly to the prize (no cents lost or created)', () => {
      const cases: Array<[bigint, number[]]> = [
        [99999n, [50, 30, 20]],
        [12345n, [3, 2, 1]],
        [7n, [1, 1, 1, 1]],
      ];
      for (const [prize, weights] of cases) {
        const shares = distributePrize(prize, weights);
        expect(shares.reduce((a, b) => a + b, 0n)).toBe(prize);
      }
    });
    it('rejects empty or non-positive weights', () => {
      expect(() => distributePrize(100n, [])).toThrow();
      expect(() => distributePrize(100n, [1, 0])).toThrow();
    });
  });
});
