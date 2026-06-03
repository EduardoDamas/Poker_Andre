import { freshDeck, shuffleDeck, verifyCommitment, hashSeed } from './deck';

describe('deck', () => {
  it('a fresh deck has 52 unique cards', () => {
    const deck = freshDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck).size).toBe(52);
  });

  it('a shuffled deck is a permutation of the fresh deck', () => {
    const { cards } = shuffleDeck();
    expect(cards).toHaveLength(52);
    expect(new Set(cards)).toEqual(new Set(freshDeck()));
  });

  it('commit-reveal: the revealed seed matches its published hash', () => {
    const { seed, seedHash } = shuffleDeck();
    expect(seedHash).toBe(hashSeed(seed));
    expect(verifyCommitment(seed, seedHash)).toBe(true);
  });

  it('rejects a tampered seed', () => {
    const { seed, seedHash } = shuffleDeck();
    expect(verifyCommitment(seed + '00', seedHash)).toBe(false);
  });

  it('produces different orderings across shuffles (sanity, not a stats test)', () => {
    const a = shuffleDeck().cards.join('');
    const b = shuffleDeck().cards.join('');
    expect(a).not.toBe(b);
  });
});
