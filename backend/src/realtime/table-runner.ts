import { PokerHand } from '../poker/hand';
import { Action } from '../poker/betting-round';
import { tournamentBlinds } from './table.service';
import { decideRobotAction } from './bot-brain';

/**
 * Play a single table's elimination down to ONE winner (server-authoritative).
 *
 * Reuses the PokerHand engine with the tournament rules already in place: each
 * player starts with 1000 chips, blinds escalate (50, doubling every 3 hands),
 * stacks carry across hands, and a player busts at 0 chips. Hands are dealt until
 * a single player holds all the chips.
 *
 * `decide` supplies each actor's move — a bot brain in headless/solo play, or the
 * real player's action in socket-driven play. Chips are zero-sum within the table
 * (no rake), so the winner ends with exactly seatIds.length × startingStack.
 *
 * This is the per-table building block of the multi-table shootout: the winner it
 * returns is what advances to the next round (see tournament/multi-table.ts).
 */

const STARTING_STACK = 1000;

export type Decider = (hand: PokerHand) => Action;

export interface TableResult {
  winnerId: string;
  handsPlayed: number;
  finalStacks: Record<string, number>;
}

/** A safe legal fallback so a bad/illegal decision never stalls the hand. */
function safeFallback(hand: PokerHand): Action {
  const legal = hand.legalActions();
  if (legal.includes('check')) return { type: 'check' };
  if (legal.includes('call')) return { type: 'call' };
  return { type: 'fold' };
}

export function playTableToWinner(
  seatIds: string[],
  decide: Decider,
  opts: { startingStack?: number; maxHands?: number } = {},
): TableResult {
  const startingStack = opts.startingStack ?? STARTING_STACK;
  const maxHands = opts.maxHands ?? 100_000;

  if (seatIds.length === 0) throw new Error('A table needs at least 1 player.');
  const stacks: Record<string, number> = {};
  for (const id of seatIds) stacks[id] = startingStack;

  if (seatIds.length === 1) {
    return { winnerId: seatIds[0], handsPlayed: 0, finalStacks: stacks };
  }

  let alive = [...seatIds];
  let handsPlayed = 0;

  while (alive.length > 1 && handsPlayed < maxHands) {
    const hand = new PokerHand(
      alive.map((id) => ({ id, stack: stacks[id] })),
      tournamentBlinds(handsPlayed),
    );

    let guard = 0;
    while (!hand.isComplete() && guard++ < 10_000) {
      const actor = hand.actingPlayerId;
      if (!actor) break;
      try {
        hand.act(actor, decide(hand));
      } catch {
        hand.act(actor, safeFallback(hand));
      }
    }

    const out = hand.result();
    for (const id of alive) {
      if (out.finalStacks[id] !== undefined) stacks[id] = out.finalStacks[id];
    }
    alive = alive.filter((id) => stacks[id] > 0);
    handsPlayed += 1;
  }

  // One player left (or, if the guard tripped, the chip leader).
  const winnerId =
    alive.length === 1 ? alive[0] : [...seatIds].sort((a, b) => stacks[b] - stacks[a])[0];
  return { winnerId, handsPlayed, finalStacks: stacks };
}

/** Bot brain plays every seat — used for solo/practice tables and headless tests. */
export const botDecider: Decider = (hand) => {
  const actor = hand.actingPlayerId!;
  return decideRobotAction(hand.holeCardsOf(actor), hand.board, hand.legalActions()) as Action;
};

/** Convenience: play a table entirely with the built-in bot brain. */
export function playTableWithBots(seatIds: string[]): TableResult {
  return playTableToWinner(seatIds, botDecider);
}
