import { dealHand } from './dealer';
import { Card } from './deck';

/**
 * STEP C1 gate — dealing hole + community cards with burns.
 * The core invariant: no card is ever dealt or burned twice.
 */
describe('dealer (Texas Hold\'em)', () => {
  function allCards(hand: ReturnType<typeof dealHand>): Card[] {
    return [
      ...hand.holeCards.flat(),
      ...hand.board,
      ...hand.burned,
    ];
  }

  it.each([2, 3, 4, 5, 6, 7, 8])('deals %i players with no duplicate cards', (n) => {
    const hand = dealHand(n);

    // Counts: 2 hole each + 5 board + 3 burns.
    expect(hand.holeCards).toHaveLength(n);
    hand.holeCards.forEach((h) => expect(h).toHaveLength(2));
    expect(hand.board).toHaveLength(5);
    expect(hand.burned).toHaveLength(3);

    const cards = allCards(hand);
    expect(cards).toHaveLength(n * 2 + 5 + 3);
    // No card appears twice anywhere.
    expect(new Set(cards).size).toBe(cards.length);
  });

  it('board equals flop + turn + river in order', () => {
    const hand = dealHand(4);
    expect(hand.board).toEqual([...hand.flop, hand.turn, hand.river]);
  });

  it('all dealt cards come from a single 52-card deck', () => {
    const hand = dealHand(8);
    const cards = allCards(hand);
    cards.forEach((c) => expect(c).toMatch(/^[2-9TJQKA][shdc]$/));
    expect(new Set(cards).size).toBe(cards.length);
  });

  it('exposes commit-reveal material from the shuffle', () => {
    const hand = dealHand(2);
    expect(hand.seedHash).toMatch(/^[0-9a-f]{64}$/);
    expect(hand.seed).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects invalid player counts', () => {
    expect(() => dealHand(1)).toThrow();
    expect(() => dealHand(9)).toThrow();
    expect(() => dealHand(2.5)).toThrow();
  });

  it('is deterministic when given a fixed deck', () => {
    // Build a known deck so the deal is reproducible.
    const fixed = {
      cards: [
        'As', 'Ah', 'Kd', 'Kc', // hole: P0 [As,Ah], P1 [Kd,Kc]
        'Qs', '2h', '3d', '4c', // burn Qs, flop 2h 3d 4c
        '5s', '6h', // burn 5s, turn 6h
        '7s', '8h', // burn 7s, river 8h
        ...Array(40).fill('9d'), // filler (unused)
      ] as Card[],
      seedHash: 'a'.repeat(64),
      seed: 'b'.repeat(64),
    };
    const hand = dealHand(2, fixed);
    expect(hand.holeCards[0]).toEqual(['As', 'Ah']);
    expect(hand.holeCards[1]).toEqual(['Kd', 'Kc']);
    expect(hand.flop).toEqual(['2h', '3d', '4c']);
    expect(hand.turn).toBe('6h');
    expect(hand.river).toBe('8h');
    expect(hand.burned).toEqual(['Qs', '5s', '7s']);
  });
});
