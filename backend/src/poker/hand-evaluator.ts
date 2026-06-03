import { Card } from './deck';

/**
 * Texas Hold'em hand evaluator.
 *
 * Evaluates the best 5-card poker hand from 5–7 cards and produces a directly
 * comparable key: [category, ...tieBreakers]. Higher is better; lexicographic
 * comparison decides the winner, equal keys = split pot.
 *
 * Every payout depends on this being correct — hence the exhaustive test suite.
 */

export enum HandCategory {
  HIGH_CARD = 1,
  PAIR = 2,
  TWO_PAIR = 3,
  THREE_OF_A_KIND = 4,
  STRAIGHT = 5,
  FLUSH = 6,
  FULL_HOUSE = 7,
  FOUR_OF_A_KIND = 8,
  STRAIGHT_FLUSH = 9,
}

const CATEGORY_NAMES: Record<HandCategory, string> = {
  [HandCategory.HIGH_CARD]: 'High Card',
  [HandCategory.PAIR]: 'Pair',
  [HandCategory.TWO_PAIR]: 'Two Pair',
  [HandCategory.THREE_OF_A_KIND]: 'Three of a Kind',
  [HandCategory.STRAIGHT]: 'Straight',
  [HandCategory.FLUSH]: 'Flush',
  [HandCategory.FULL_HOUSE]: 'Full House',
  [HandCategory.FOUR_OF_A_KIND]: 'Four of a Kind',
  [HandCategory.STRAIGHT_FLUSH]: 'Straight Flush',
};

const RANK_VALUE: Record<string, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  T: 10, J: 11, Q: 12, K: 13, A: 14,
};

export interface HandResult {
  category: HandCategory;
  name: string;
  /** [category, ...tieBreakers] — compare lexicographically. */
  key: number[];
}

function rankOf(card: Card): number {
  return RANK_VALUE[card[0]];
}
function suitOf(card: Card): string {
  return card[1];
}

/** Highest card of the best straight in `ranks` (Ace plays high or low), or null. */
function bestStraightHigh(ranks: Iterable<number>): number | null {
  const present = new Set(ranks);
  if (present.has(14)) present.add(1); // Ace low for the wheel (A-2-3-4-5)
  for (let high = 14; high >= 5; high--) {
    let run = true;
    for (let k = 0; k < 5; k++) {
      if (!present.has(high - k)) {
        run = false;
        break;
      }
    }
    if (run) return high;
  }
  return null;
}

/**
 * Evaluate the best 5-card hand from the given cards (5–7).
 */
export function evaluate(cards: Card[]): HandResult {
  if (cards.length < 5) {
    throw new Error('Need at least 5 cards to evaluate a hand.');
  }

  const values = cards.map(rankOf);
  const distinctDesc = [...new Set(values)].sort((a, b) => b - a);

  // rank -> count
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);

  // suit -> ranks of that suit
  const bySuit = new Map<string, number[]>();
  for (const c of cards) {
    const s = suitOf(c);
    (bySuit.get(s) ?? bySuit.set(s, []).get(s)!).push(rankOf(c));
  }

  // Flush suit (at most one possible with 7 cards).
  let flushRanks: number[] | null = null;
  for (const ranks of bySuit.values()) {
    if (ranks.length >= 5) flushRanks = [...ranks].sort((a, b) => b - a);
  }

  // Straight flush.
  if (flushRanks) {
    const sfHigh = bestStraightHigh(flushRanks);
    if (sfHigh) return result(HandCategory.STRAIGHT_FLUSH, [sfHigh]);
  }

  // Groups by count, ranked: highest count first, then highest rank.
  const quads = ranksWithCount(counts, 4);
  const trips = ranksWithCount(counts, 3);
  const pairs = ranksWithCount(counts, 2);

  // Four of a kind.
  if (quads.length) {
    const quad = quads[0];
    const kicker = distinctDesc.find((r) => r !== quad)!;
    return result(HandCategory.FOUR_OF_A_KIND, [quad, kicker]);
  }

  // Full house (trips + another pair-or-trips).
  if (trips.length) {
    const tripRank = trips[0];
    const pairRank = [...trips.slice(1), ...pairs]
      .filter((r) => r !== tripRank)
      .sort((a, b) => b - a)[0];
    if (pairRank !== undefined) {
      return result(HandCategory.FULL_HOUSE, [tripRank, pairRank]);
    }
  }

  // Flush.
  if (flushRanks) {
    return result(HandCategory.FLUSH, flushRanks.slice(0, 5));
  }

  // Straight.
  const straightHigh = bestStraightHigh(values);
  if (straightHigh) {
    return result(HandCategory.STRAIGHT, [straightHigh]);
  }

  // Three of a kind.
  if (trips.length) {
    const tripRank = trips[0];
    const kickers = distinctDesc.filter((r) => r !== tripRank).slice(0, 2);
    return result(HandCategory.THREE_OF_A_KIND, [tripRank, ...kickers]);
  }

  // Two pair.
  if (pairs.length >= 2) {
    const [p1, p2] = pairs;
    const kicker = distinctDesc.find((r) => r !== p1 && r !== p2)!;
    return result(HandCategory.TWO_PAIR, [p1, p2, kicker]);
  }

  // One pair.
  if (pairs.length === 1) {
    const pair = pairs[0];
    const kickers = distinctDesc.filter((r) => r !== pair).slice(0, 3);
    return result(HandCategory.PAIR, [pair, ...kickers]);
  }

  // High card.
  return result(HandCategory.HIGH_CARD, distinctDesc.slice(0, 5));
}

function ranksWithCount(counts: Map<number, number>, n: number): number[] {
  return [...counts.entries()]
    .filter(([, c]) => c === n)
    .map(([r]) => r)
    .sort((a, b) => b - a);
}

function result(category: HandCategory, tieBreakers: number[]): HandResult {
  return { category, name: CATEGORY_NAMES[category], key: [category, ...tieBreakers] };
}

/** Compare two hand keys. >0 if a beats b, <0 if b beats a, 0 if tie (split). */
export function compareKeys(a: number[], b: number[]): number {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** Compare two sets of cards directly. */
export function compareHands(a: Card[], b: Card[]): number {
  return compareKeys(evaluate(a).key, evaluate(b).key);
}
