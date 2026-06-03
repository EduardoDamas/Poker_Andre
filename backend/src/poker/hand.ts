import { Card, ShuffledDeck } from './deck';
import { dealHand, DealtHand } from './dealer';
import { Action, ActionType, BettingRound } from './betting-round';
import { buildSidePots, Pot } from './side-pots';
import { compareKeys, evaluate } from './hand-evaluator';

/**
 * Full Texas Hold'em hand orchestrator (server-authoritative).
 *
 * Ties together dealing (C1), the evaluator (C2), betting (C3) and side pots
 * (C4): preflop → flop → turn → river → showdown, carrying contributions across
 * streets, then awarding each pot (main + side) to the best eligible hand with
 * correct split/odd-chip handling.
 *
 * Positional rules (deterministic):
 *   seats are given in order [SB, BB, UTG, ...]; the dealer is the last seat
 *   (the SB heads-up). Preflop acts from after the BB; postflop from after the
 *   dealer button. Odd chips in a split go to the earliest seat (SB-most).
 */

export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'complete';

export interface SeatInput {
  id: string;
  stack: number;
}

export interface PotResult extends Pot {
  winnerIds: string[];
}

export interface HandOutcome {
  board: [Card, Card, Card, Card, Card];
  pots: PotResult[];
  refunds: Record<string, number>;
  /** Net chips returned to each player at showdown (winnings + refunds). */
  payouts: Record<string, number>;
  finalStacks: Record<string, number>;
  seedHash: string;
  seed: string;
}

export class PokerHand {
  private readonly seatOrder: string[];
  private readonly initialStacks: Record<string, number>;
  private readonly stacks: Record<string, number>;
  private readonly totalContrib: Record<string, number> = {};
  private readonly folded = new Set<string>();
  private readonly hole: Record<string, [Card, Card]> = {};
  private readonly dealt: DealtHand;
  private readonly smallBlind: number;
  private readonly bigBlind: number;

  private street: Street = 'preflop';
  private round: BettingRound | null = null;
  private outcome: HandOutcome | null = null;

  constructor(
    seats: SeatInput[],
    opts: { smallBlind: number; bigBlind: number; deck?: ShuffledDeck },
  ) {
    if (seats.length < 2) throw new Error('A hand needs at least 2 players.');
    this.seatOrder = seats.map((s) => s.id);
    this.initialStacks = Object.fromEntries(seats.map((s) => [s.id, s.stack]));
    this.stacks = { ...this.initialStacks };
    for (const id of this.seatOrder) this.totalContrib[id] = 0;
    this.smallBlind = opts.smallBlind;
    this.bigBlind = opts.bigBlind;

    this.dealt = dealHand(seats.length, opts.deck);
    this.seatOrder.forEach((id, i) => (this.hole[id] = this.dealt.holeCards[i]));

    // Open preflop betting (posts blinds).
    this.round = BettingRound.preflop(
      this.seatOrder.map((id) => ({ id, stack: this.stacks[id] })),
      this.smallBlind,
      this.bigBlind,
    );
  }

  // ---- public state ----

  get currentStreet(): Street {
    return this.street;
  }

  get board(): Card[] {
    const counts: Record<Street, number> = {
      preflop: 0,
      flop: 3,
      turn: 4,
      river: 5,
      complete: 5,
    };
    return this.dealt.board.slice(0, counts[this.street]);
  }

  get actingPlayerId(): string | null {
    return this.round?.actingPlayerId ?? null;
  }

  holeCardsOf(id: string): [Card, Card] {
    return this.hole[id];
  }

  legalActions(): ActionType[] {
    return this.round?.legalActions() ?? [];
  }

  isComplete(): boolean {
    return this.street === 'complete';
  }

  result(): HandOutcome {
    if (!this.outcome) throw new Error('Hand is not complete yet.');
    return this.outcome;
  }

  // ---- driving the hand ----

  act(playerId: string, action: Action): void {
    if (this.street === 'complete') throw new Error('Hand is already complete.');
    if (!this.round) throw new Error('No betting in progress.');
    this.round.act(playerId, action);
    if (this.round.isComplete()) {
      this.settleRound();
      this.proceed();
    }
  }

  // ---- internals ----

  private livePlayers(): string[] {
    return this.seatOrder.filter((id) => !this.folded.has(id));
  }

  private settleRound(): void {
    for (const p of this.round!.players) {
      this.stacks[p.id] = p.stack;
      this.totalContrib[p.id] += p.committed;
      if (p.folded) this.folded.add(p.id);
    }
    this.round = null;
  }

  private nextStreet(s: Street): Street {
    return s === 'preflop' ? 'flop' : s === 'flop' ? 'turn' : 'river';
  }

  private proceed(): void {
    const live = this.livePlayers();
    if (live.length <= 1) return this.finish();

    // Advance streets; open a betting round once ≥2 players can still bet.
    while (true) {
      if (this.street === 'river') return this.finish();
      this.street = this.nextStreet(this.street);
      const bettors = live.filter((id) => this.stacks[id] > 0);
      if (bettors.length >= 2) {
        this.openPostflopRound(live);
        return;
      }
      // Fewer than 2 can bet (rest all-in): deal next street, no betting.
    }
  }

  private openPostflopRound(live: string[]): void {
    const n = this.seatOrder.length;
    const dealerIndex = n >= 3 ? n - 1 : 0;
    const start = (dealerIndex + 1) % n;

    // Live players with chips, in clockwise order from the start seat.
    const seats: SeatInput[] = [];
    for (let i = 0; i < n; i++) {
      const id = this.seatOrder[(start + i) % n];
      if (!this.folded.has(id) && this.stacks[id] > 0) {
        seats.push({ id, stack: this.stacks[id] });
      }
    }
    this.round = BettingRound.postflop(seats, this.bigBlind, 0);
    void live;
  }

  private finish(): void {
    const board = this.dealt.board;
    const { pots, refunds } = buildSidePots(this.totalContrib, this.folded);

    const payouts: Record<string, number> = {};
    for (const id of this.seatOrder) payouts[id] = 0;

    // Refund uncalled bets straight back to the contributor.
    for (const [id, amount] of Object.entries(refunds)) {
      payouts[id] += amount;
      this.stacks[id] += amount;
    }

    const potResults: PotResult[] = [];
    for (const pot of pots) {
      const winnerIds = this.winnersOf(pot.eligiblePlayerIds, board);
      this.awardPot(pot.amount, winnerIds, payouts);
      potResults.push({ ...pot, winnerIds });
    }

    this.street = 'complete';
    this.outcome = {
      board,
      pots: potResults,
      refunds,
      payouts,
      finalStacks: { ...this.stacks },
      seedHash: this.dealt.seedHash,
      seed: this.dealt.seed,
    };
  }

  // Best eligible hand(s) for a pot (ties → multiple winners).
  private winnersOf(eligibleIds: string[], board: Card[]): string[] {
    let best: number[] | null = null;
    let winners: string[] = [];
    for (const id of eligibleIds) {
      const key = evaluate([...this.hole[id], ...board]).key;
      const cmp = best === null ? 1 : compareKeys(key, best);
      if (cmp > 0) {
        best = key;
        winners = [id];
      } else if (cmp === 0) {
        winners.push(id);
      }
    }
    return winners;
  }

  // Split a pot among winners; odd chips go to the earliest seat (SB-most).
  private awardPot(amount: number, winnerIds: string[], payouts: Record<string, number>): void {
    const ordered = [...winnerIds].sort(
      (a, b) => this.seatOrder.indexOf(a) - this.seatOrder.indexOf(b),
    );
    const base = Math.floor(amount / ordered.length);
    let remainder = amount - base * ordered.length;
    for (const id of ordered) {
      const share = base + (remainder > 0 ? 1 : 0);
      if (remainder > 0) remainder -= 1;
      payouts[id] += share;
      this.stacks[id] += share;
    }
  }
}
