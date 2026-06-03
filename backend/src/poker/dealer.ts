import { Card, ShuffledDeck, shuffleDeck } from './deck';

/**
 * Deals a Texas Hold'em hand from a shuffled deck, following casino dealing
 * order with burn cards. The server does this; clients never see the deck.
 *
 * Dealing order (standard):
 *   1. Two hole cards to each player (one at a time, round by round — but since
 *      the deck is already randomly shuffled, dealing them contiguously per
 *      player is equivalent and simpler).
 *   2. Burn 1, deal 3 (flop).
 *   3. Burn 1, deal 1 (turn).
 *   4. Burn 1, deal 1 (river).
 */

export interface DealtHand {
  /** holeCards[i] = the two cards for player i. */
  holeCards: [Card, Card][];
  flop: [Card, Card, Card];
  turn: Card;
  river: Card;
  /** Cards burned before flop/turn/river, in order. */
  burned: Card[];
  /** All five community cards, for convenience. */
  board: [Card, Card, Card, Card, Card];
  /** Commit-reveal material from the shuffle (audit / dispute resolution). */
  seedHash: string;
  seed: string;
}

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 8; // Phase 1 poker table size (per the spec)

/**
 * Deal a hand for `numPlayers`. Pass a pre-made `ShuffledDeck` for deterministic
 * tests; otherwise a fresh cryptographic shuffle is used.
 *
 * 8 players need 8*2 + 3 burns + 5 board = 24 cards — always within 52.
 */
export function dealHand(numPlayers: number, deck?: ShuffledDeck): DealtHand {
  if (!Number.isInteger(numPlayers) || numPlayers < MIN_PLAYERS || numPlayers > MAX_PLAYERS) {
    throw new Error(`numPlayers must be an integer in [${MIN_PLAYERS}, ${MAX_PLAYERS}].`);
  }

  const { cards, seedHash, seed } = deck ?? shuffleDeck();
  let i = 0;
  const next = (): Card => cards[i++];

  // 1. Hole cards.
  const holeCards: [Card, Card][] = [];
  for (let p = 0; p < numPlayers; p++) {
    holeCards.push([next(), next()]);
  }

  const burned: Card[] = [];

  // 2. Flop (burn 1, deal 3).
  burned.push(next());
  const flop: [Card, Card, Card] = [next(), next(), next()];

  // 3. Turn (burn 1, deal 1).
  burned.push(next());
  const turn = next();

  // 4. River (burn 1, deal 1).
  burned.push(next());
  const river = next();

  return {
    holeCards,
    flop,
    turn,
    river,
    burned,
    board: [...flop, turn, river],
    seedHash,
    seed,
  };
}
