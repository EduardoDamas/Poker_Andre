import { Card } from './deck';
import {
  evaluate,
  compareHands,
  compareKeys,
  HandCategory,
} from './hand-evaluator';

const C = (s: string): Card[] => s.trim().split(/\s+/) as Card[];

/**
 * STEP C2 gate — hand evaluator. The most important gate in the project.
 */
describe('hand evaluator', () => {
  describe('category detection (7-card hands)', () => {
    const cases: Array<[string, HandCategory]> = [
      ['As Ks Qs Js Ts 2h 3d', HandCategory.STRAIGHT_FLUSH], // royal
      ['9s 8s 7s 6s 5s Kd Qd', HandCategory.STRAIGHT_FLUSH],
      ['Ah Ad As Ac Kd 2h 3s', HandCategory.FOUR_OF_A_KIND],
      ['Kh Kd Ks Qc Qd 2h 3s', HandCategory.FULL_HOUSE],
      ['Ah Kh 9h 5h 2h 7d 8c', HandCategory.FLUSH],
      ['9d 8s 7h 6c 5d Ah Kh', HandCategory.STRAIGHT],
      ['Qh Qd Qs 7c 2d 9h 3s', HandCategory.THREE_OF_A_KIND],
      ['Jh Jd 4s 4c 9d 2h 3s', HandCategory.TWO_PAIR],
      ['Th Td 8s 5c 2d 9h 3s', HandCategory.PAIR],
      ['Ah Kd 9s 7c 4d 3h 2s', HandCategory.HIGH_CARD],
    ];
    it.each(cases)('detects %s as the right category', (hand, expected) => {
      expect(evaluate(C(hand)).category).toBe(expected);
    });
  });

  describe('straights', () => {
    it('recognises the A-2-3-4-5 wheel (Ace low, high card = 5)', () => {
      const r = evaluate(C('Ah 2d 3s 4c 5h Kd Qs'));
      expect(r.category).toBe(HandCategory.STRAIGHT);
      expect(r.key[1]).toBe(5);
    });
    it('A-high straight (Ten to Ace) beats King-high straight', () => {
      const broadway = C('Ah Kd Qs Jc Th 2h 3s');
      const kingHigh = C('Kh Qd Js Tc 9h 2h 3s');
      expect(compareHands(broadway, kingHigh)).toBeGreaterThan(0);
    });
    it('wheel straight loses to a 6-high straight', () => {
      const wheel = C('Ah 2d 3s 4c 5h 9d Js');
      const sixHigh = C('6h 5d 4s 3c 2h Ad Qs');
      expect(compareHands(sixHigh, wheel)).toBeGreaterThan(0);
    });
    it('straight flush is NOT mistaken for a plain straight', () => {
      const r = evaluate(C('5s 6s 7s 8s 9s 2h 3d'));
      expect(r.category).toBe(HandCategory.STRAIGHT_FLUSH);
      expect(r.key[1]).toBe(9);
    });
  });

  describe('category ordering (each beats the one below)', () => {
    const ladder: Array<[string, string]> = [
      ['As Ks Qs Js Ts 2h 3d', 'Ah Ad As Ac Kd 2h 3s'], // SF > quads
      ['Ah Ad As Ac Kd 2h 3s', 'Kh Kd Ks Qc Qd 2h 3s'], // quads > full house
      ['Kh Kd Ks Qc Qd 2h 3s', 'Ah Kh 9h 5h 2h 7d 8c'], // full house > flush
      ['Ah Kh 9h 5h 2h 7d 8c', '9d 8s 7h 6c 5d Ah Kh'], // flush > straight
      ['9d 8s 7h 6c 5d Ah Kh', 'Qh Qd Qs 7c 2d 9h 3s'], // straight > trips
      ['Qh Qd Qs 7c 2d 9h 3s', 'Jh Jd 4s 4c 9d 2h 3s'], // trips > two pair
      ['Jh Jd 4s 4c 9d 2h 3s', 'Th Td 8s 5c 2d 9h 3s'], // two pair > pair
      ['Th Td 8s 5c 2d 9h 3s', 'Ah Kd 9s 7c 4d 3h 2s'], // pair > high card
    ];
    it.each(ladder)('%s beats %s', (better, worse) => {
      expect(compareHands(C(better), C(worse))).toBeGreaterThan(0);
    });
  });

  describe('tie-breakers within a category', () => {
    it('higher pair wins', () => {
      expect(
        compareHands(C('Kh Kd 5s 3c 2d 7h 8s'), C('Qh Qd 5s 3c 2d 7h 8s')),
      ).toBeGreaterThan(0);
    });
    it('same pair, higher kicker wins', () => {
      expect(
        compareHands(C('Kh Kd Ac 3s 2d 7h 8s'), C('Kh Kd Qc 3s 2d 7h 8s')),
      ).toBeGreaterThan(0);
    });
    it('two pair: higher top pair wins regardless of low pair', () => {
      expect(
        compareHands(C('Ah Ad 2s 2c 9d 7h 3s'), C('Kh Kd Qs Qc 9d 7h 3s')),
      ).toBeGreaterThan(0);
    });
    it('two pair: equal pairs decided by kicker', () => {
      expect(
        compareHands(C('Ah Ad Ks Kc Qd 7h 3s'), C('Ah Ad Ks Kc Jd 7h 3s')),
      ).toBeGreaterThan(0);
    });
    it('full house: higher trips wins', () => {
      expect(
        compareHands(C('Ah Ad As 2c 2d 7h 3s'), C('Kh Kd Ks Ac Ad 7h 3s')),
      ).toBeGreaterThan(0);
    });
    it('flush: highest card decides', () => {
      expect(
        compareHands(C('Ah Qh 9h 5h 2h 7d 8c'), C('Kh Qh 9h 5h 2h 7d 8c')),
      ).toBeGreaterThan(0);
    });
    it('quads: kicker decides when quads are equal (shared on board)', () => {
      const a = C('As Ah Ad Ac Kd 2h 3s'); // AAAA + K
      const b = C('As Ah Ad Ac Qd 2h 3s'); // AAAA + Q
      expect(compareHands(a, b)).toBeGreaterThan(0);
    });
  });

  describe('split pots (identical strength)', () => {
    it('two players playing the same board straight tie', () => {
      const a = C('9d 8s 7h 6c 5d 2h 3s');
      const b = C('9h 8d 7s 6h 5c 2d 4s');
      expect(compareHands(a, b)).toBe(0);
    });
    it('compareKeys returns 0 for equal keys', () => {
      expect(compareKeys([6, 14, 13, 9, 5, 2], [6, 14, 13, 9, 5, 2])).toBe(0);
    });
  });

  describe('best-5-of-7 selection', () => {
    it('ignores worse cards and picks the best five', () => {
      // Contains a flush (hearts) AND a pair; flush must win out.
      const r = evaluate(C('Ah Kh Qh 2h 7h Ks Kd'));
      expect(r.category).toBe(HandCategory.FLUSH);
    });
    it('finds the full house using two trips (uses higher as trips)', () => {
      const r = evaluate(C('Kh Kd Ks Qc Qd Qh 2s')); // KKK + QQQ
      expect(r.category).toBe(HandCategory.FULL_HOUSE);
      expect(r.key.slice(1)).toEqual([13, 12]); // trips K, pair Q
    });
  });

  it('rejects fewer than 5 cards', () => {
    expect(() => evaluate(C('Ah Kd Qs'))).toThrow();
  });
});
