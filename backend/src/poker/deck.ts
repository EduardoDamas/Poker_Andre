import { createHash, randomBytes, randomInt } from 'crypto';

/**
 * Authoritative deck for Texas Hold'em.
 *
 * SECURITY (real-money game — read before touching):
 *  - Shuffling uses Node's CSPRNG (`crypto.randomInt`), NEVER `Math.random`.
 *  - Commit-reveal: before any card is dealt the server publishes `seedHash`
 *    (SHA-256 of a secret seed). After the hand it reveals the seed, so any
 *    player can recompute the shuffle and confirm it was not manipulated.
 *  - The deck lives only on the server. Clients receive only the cards they
 *    are entitled to see.
 */

export const SUITS = ['s', 'h', 'd', 'c'] as const; // spades, hearts, diamonds, clubs
export const RANKS = [
  '2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A',
] as const;

export type Card = `${(typeof RANKS)[number]}${(typeof SUITS)[number]}`;

export function freshDeck(): Card[] {
  const deck: Card[] = [];
  for (const r of RANKS) {
    for (const s of SUITS) {
      deck.push(`${r}${s}` as Card);
    }
  }
  return deck; // 52 cards
}

export interface ShuffledDeck {
  cards: Card[];
  /** Published BEFORE the deal. */
  seedHash: string;
  /** Published AFTER the hand, to prove the shuffle. */
  seed: string;
}

/**
 * Fisher–Yates shuffle driven by the CSPRNG. Returns the deck plus the
 * commit-reveal material. `seed` must be kept secret until the hand ends.
 */
export function shuffleDeck(): ShuffledDeck {
  const seed = randomBytes(32).toString('hex');
  const seedHash = createHash('sha256').update(seed).digest('hex');
  const cards = freshDeck();

  // Unbiased Fisher–Yates using crypto.randomInt (rejection-sampled, uniform).
  for (let i = cards.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }

  return { cards, seedHash, seed };
}

/** SHA-256 hex of a seed — used to verify a published commitment. */
export function hashSeed(seed: string): string {
  return createHash('sha256').update(seed).digest('hex');
}

/** True if `seed` matches a previously published `seedHash`. */
export function verifyCommitment(seed: string, seedHash: string): boolean {
  return hashSeed(seed) === seedHash;
}
