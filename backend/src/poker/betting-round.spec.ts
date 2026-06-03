import { BettingRound } from './betting-round';

/**
 * STEP C3 gate — single-street betting mechanics.
 */
describe('BettingRound', () => {
  const seats = (stacks: number[]) =>
    stacks.map((stack, i) => ({ id: `p${i}`, stack }));

  describe('preflop blinds', () => {
    it('posts small and big blinds and sets first-to-act after the BB', () => {
      const r = BettingRound.preflop(seats([100, 100, 100]), 1, 2);
      expect(r.currentBet).toBe(2);
      // p0=SB committed 1, p1=BB committed 2, p2=UTG acts first.
      expect(r.result().contributions).toMatchObject({ p0: 1, p1: 2, p2: 0 });
      expect(r.actingPlayerId).toBe('p2');
    });

    it('big blind has the option to check when everyone limps', () => {
      const r = BettingRound.preflop(seats([100, 100, 100]), 1, 2);
      r.act('p2', { type: 'call' }); // UTG calls 2
      r.act('p0', { type: 'call' }); // SB completes to 2
      expect(r.isComplete()).toBe(false); // BB still has the option
      expect(r.actingPlayerId).toBe('p1');
      r.act('p1', { type: 'check' }); // BB checks
      expect(r.isComplete()).toBe(true);
      expect(r.result().pot).toBe(6);
    });
  });

  describe('legal/illegal actions', () => {
    it('rejects acting out of turn', () => {
      const r = BettingRound.preflop(seats([100, 100, 100]), 1, 2);
      expect(() => r.act('p0', { type: 'call' })).toThrow(/turn/);
    });

    it('cannot check when facing a bet', () => {
      const r = BettingRound.preflop(seats([100, 100, 100]), 1, 2);
      expect(() => r.act('p2', { type: 'check' })).toThrow(/check/i);
    });

    it('cannot call when there is nothing to call', () => {
      const r = BettingRound.postflop(seats([100, 100]), 2, 0);
      expect(() => r.act('p0', { type: 'call' })).toThrow(/Nothing to call/);
    });

    it('cannot bet when a bet already exists (must raise)', () => {
      const r = BettingRound.postflop(seats([100, 100]), 2, 0);
      r.act('p0', { type: 'bet', amount: 10 });
      expect(() => r.act('p1', { type: 'bet', amount: 20 })).toThrow(/raise/);
    });

    it('enforces the minimum opening bet', () => {
      const r = BettingRound.postflop(seats([100, 100]), 10, 0);
      expect(() => r.act('p0', { type: 'bet', amount: 5 })).toThrow(/at least 10/);
    });
  });

  describe('min-raise rule', () => {
    it('rejects a raise smaller than the last raise size', () => {
      const r = BettingRound.postflop(seats([100, 100]), 2, 0);
      r.act('p0', { type: 'bet', amount: 10 }); // min raise size becomes 10
      // raise to 15 = +5 increment, below the 10 min-raise → illegal
      expect(() => r.act('p1', { type: 'raise', amount: 15 })).toThrow(/min-raise/);
    });

    it('accepts a legal raise and reopens the action', () => {
      const r = BettingRound.postflop(seats([100, 100, 100]), 2, 0);
      r.act('p0', { type: 'bet', amount: 10 });
      r.act('p1', { type: 'call' }); // p1 calls 10
      r.act('p2', { type: 'raise', amount: 20 }); // legal raise (+10)
      // p0 and p1 must act again.
      expect(r.isComplete()).toBe(false);
      expect(r.actingPlayerId).toBe('p0');
      r.act('p0', { type: 'call' });
      r.act('p1', { type: 'call' });
      expect(r.isComplete()).toBe(true);
      expect(r.result().pot).toBe(60); // 20 * 3
    });
  });

  describe('round completion & pot accounting', () => {
    it('closes when all live players have matched the bet', () => {
      const r = BettingRound.preflop(seats([100, 100, 100]), 1, 2);
      r.act('p2', { type: 'raise', amount: 6 });
      r.act('p0', { type: 'fold' });
      r.act('p1', { type: 'call' }); // matches 6
      expect(r.isComplete()).toBe(true);
      const res = r.result();
      expect(res.pot).toBe(13); // p0:1 (folded SB) + p1:6 + p2:6
      expect(res.livePlayerIds).toEqual(['p1', 'p2']);
    });

    it('ends immediately when everyone folds to one player', () => {
      const r = BettingRound.preflop(seats([100, 100, 100]), 1, 2);
      r.act('p2', { type: 'raise', amount: 6 });
      r.act('p0', { type: 'fold' });
      r.act('p1', { type: 'fold' });
      expect(r.isComplete()).toBe(true);
      expect(r.result().livePlayerIds).toEqual(['p2']);
    });

    it('pot always equals the sum of contributions', () => {
      const r = BettingRound.postflop(seats([100, 100, 100]), 2, 0);
      r.act('p0', { type: 'bet', amount: 8 });
      r.act('p1', { type: 'raise', amount: 20 });
      r.act('p2', { type: 'fold' });
      r.act('p0', { type: 'call' });
      const res = r.result();
      const sum = Object.values(res.contributions).reduce((a, b) => a + b, 0);
      expect(res.pot).toBe(sum);
      expect(res.pot).toBe(40); // p0:20 + p1:20 + p2:0
    });
  });

  describe('all-in handling', () => {
    it('a short all-in call commits the whole stack and marks all-in', () => {
      const r = BettingRound.postflop([{ id: 'p0', stack: 100 }, { id: 'p1', stack: 7 }], 2, 0);
      r.act('p0', { type: 'bet', amount: 20 });
      r.act('p1', { type: 'call' }); // can only put in 7 → all-in
      expect(r.isComplete()).toBe(true);
      expect(r.result().contributions).toMatchObject({ p0: 20, p1: 7 });
    });

    it('allows an all-in bet below the minimum', () => {
      const r = BettingRound.postflop([{ id: 'p0', stack: 5 }, { id: 'p1', stack: 100 }], 10, 0);
      // p0 only has 5 but min bet is 10 → all-in for 5 is allowed
      expect(() => r.act('p0', { type: 'bet', amount: 5 })).not.toThrow();
    });
  });
});
