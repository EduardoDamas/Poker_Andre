import { PokerHand } from './hand';
import { Card, ShuffledDeck, hashSeed, verifyCommitment } from './deck';

/**
 * STEP C5 gate — full hand: deal → 4 streets → showdown → award.
 * Every scenario asserts the winners, exact payouts, and chip conservation.
 */

// Build a deterministic deck from the cards that will actually be dealt,
// padded out to 52 (the padding is never reached).
function makeDeck(cards: string[]): ShuffledDeck {
  const seed = 'b'.repeat(64);
  const padded = [...cards];
  while (padded.length < 52) padded.push('2c');
  return { cards: padded as Card[], seedHash: hashSeed(seed), seed };
}

// Drive checks/calls for the player to act until the hand ends.
function playPassive(h: PokerHand): void {
  while (!h.isComplete()) {
    const id = h.actingPlayerId;
    if (!id) break;
    const acts = h.legalActions();
    h.act(id, { type: acts.includes('check') ? 'check' : 'call' });
  }
}

const sumValues = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);

describe('PokerHand (full hand)', () => {
  it('heads-up: best hand wins the whole pot (AA > KK)', () => {
    const deck = makeDeck([
      'As', 'Ah', // p0 hole
      'Kd', 'Kc', // p1 hole
      '2d', // burn
      '2c', '7d', '9s', // flop
      '3h', // burn
      'Jh', // turn
      '5c', // burn
      '4s', // river
    ]);
    const h = new PokerHand(
      [{ id: 'p0', stack: 100 }, { id: 'p1', stack: 100 }],
      { smallBlind: 1, bigBlind: 2, deck },
    );
    playPassive(h);
    const r = h.result();

    expect(r.board).toEqual(['2c', '7d', '9s', 'Jh', '4s']);
    expect(r.pots).toHaveLength(1);
    expect(r.pots[0].winnerIds).toEqual(['p0']);
    expect(r.payouts).toEqual({ p0: 4, p1: 0 });
    expect(r.finalStacks).toEqual({ p0: 102, p1: 98 });
    // Chip conservation.
    expect(sumValues(r.finalStacks)).toBe(200);
    // Commit-reveal verifies.
    expect(verifyCommitment(r.seed, r.seedHash)).toBe(true);
  });

  it('everyone folds preflop: last player wins the blinds (no showdown)', () => {
    const deck = makeDeck([
      'As', 'Ah', 'Kd', 'Kc', '2d', '2c', '7d', '9s', '3h', 'Jh', '5c', '4s',
    ]);
    const h = new PokerHand(
      [{ id: 'p0', stack: 100 }, { id: 'p1', stack: 100 }],
      { smallBlind: 1, bigBlind: 2, deck },
    );
    // p0 is SB and acts first preflop; folding leaves only p1.
    h.act('p0', { type: 'fold' });
    const r = h.result();

    // p1's uncalled 1 (over the SB) is refunded; the 2-chip pot (SB 1 + p1's
    // matched 1) is won by p1. payouts = pot won (2) + refund (1) = 3.
    expect(r.refunds).toEqual({ p1: 1 });
    expect(r.payouts.p1).toBe(3);
    expect(r.finalStacks).toEqual({ p0: 99, p1: 101 }); // p1 nets the SB (+1)
    expect(sumValues(r.finalStacks)).toBe(200);
  });

  it('split pot: identical board straight → chips split evenly', () => {
    const deck = makeDeck([
      '2d', '3h', // p0 hole
      '2c', '3s', // p1 hole
      'Kd', // burn
      '5c', '6d', '7h', // flop
      'Kh', // burn
      '8s', // turn
      'Ks', // burn
      '9c', // river  → board is a 9-high straight both play
    ]);
    const h = new PokerHand(
      [{ id: 'p0', stack: 100 }, { id: 'p1', stack: 100 }],
      { smallBlind: 1, bigBlind: 2, deck },
    );
    playPassive(h);
    const r = h.result();

    expect(r.pots[0].winnerIds.sort()).toEqual(['p0', 'p1']);
    expect(r.payouts).toEqual({ p0: 2, p1: 2 });
    expect(r.finalStacks).toEqual({ p0: 100, p1: 100 });
  });

  it('odd chip in a split goes to the earliest seat', () => {
    const deck = makeDeck([
      'Kd', 'Kh', // p0 hole (SB, will fold)
      '2d', '3c', // p1 hole
      '2h', '3s', // p2 hole
      '4d', // burn
      '5c', '6d', '7h', // flop
      'Ts', // burn
      '8s', // turn
      'Tc', // burn
      '9c', // river → board straight; p1 & p2 tie
    ]);
    const h = new PokerHand(
      [{ id: 'p0', stack: 100 }, { id: 'p1', stack: 100 }, { id: 'p2', stack: 100 }],
      { smallBlind: 1, bigBlind: 2, deck },
    );
    // preflop: p2 (UTG) calls, p0 (SB) folds, p1 (BB) checks.
    h.act('p2', { type: 'call' });
    h.act('p0', { type: 'fold' });
    h.act('p1', { type: 'check' });
    playPassive(h); // flop/turn/river checks

    const r = h.result();
    // Pot = 5 (p0:1 folded + p1:2 + p2:2). Split 5 between p1,p2 → 3/2, odd to p1.
    expect(r.pots[0].amount).toBe(5);
    expect(r.payouts).toMatchObject({ p0: 0, p1: 3, p2: 2 });
    expect(r.finalStacks).toEqual({ p0: 99, p1: 101, p2: 100 });
    expect(sumValues(r.finalStacks)).toBe(300);
  });

  it('all-in side pot: short stack wins main, side pot decided between the others', () => {
    const deck = makeDeck([
      'Kc', 'Kd', // p0 hole (KK)
      'Qc', 'Qd', // p1 hole (QQ)
      'Ac', 'Ad', // p2 hole (AA, short stack)
      '4c', // burn
      '2s', '5h', '8d', // flop
      '5d', // burn
      'Jc', // turn
      '6h', // burn
      '3h', // river → no help; AA > KK > QQ
    ]);
    const h = new PokerHand(
      [{ id: 'p0', stack: 100 }, { id: 'p1', stack: 100 }, { id: 'p2', stack: 20 }],
      { smallBlind: 1, bigBlind: 2, deck },
    );
    // Preflop: p2 (UTG) shoves all-in to 20, both call.
    h.act('p2', { type: 'raise', amount: 20 });
    h.act('p0', { type: 'call' });
    h.act('p1', { type: 'call' });
    // Flop: p0 bets 30, p1 calls (builds the side pot p2 can't win).
    h.act('p0', { type: 'bet', amount: 30 });
    h.act('p1', { type: 'call' });
    // Turn & river checked down.
    h.act('p0', { type: 'check' });
    h.act('p1', { type: 'check' });
    h.act('p0', { type: 'check' });
    h.act('p1', { type: 'check' });

    const r = h.result();
    expect(r.pots).toHaveLength(2);
    // Main pot (60): all three eligible → p2's aces win.
    expect(r.pots[0]).toMatchObject({ amount: 60, winnerIds: ['p2'] });
    // Side pot (60): only p0 & p1 → p0's kings win.
    expect(r.pots[1]).toMatchObject({ amount: 60, winnerIds: ['p0'] });
    expect(r.payouts).toMatchObject({ p0: 60, p1: 0, p2: 60 });
    expect(r.finalStacks).toEqual({ p0: 110, p1: 50, p2: 60 });
    expect(sumValues(r.finalStacks)).toBe(220);
  });

  it('result() throws before the hand is complete; acting after completion throws', () => {
    const deck = makeDeck([
      'As', 'Ah', 'Kd', 'Kc', '2d', '2c', '7d', '9s', '3h', 'Jh', '5c', '4s',
    ]);
    const h = new PokerHand(
      [{ id: 'p0', stack: 100 }, { id: 'p1', stack: 100 }],
      { smallBlind: 1, bigBlind: 2, deck },
    );
    expect(() => h.result()).toThrow(/not complete/);
    playPassive(h);
    expect(() => h.act('p0', { type: 'check' })).toThrow(/complete/);
  });
});
