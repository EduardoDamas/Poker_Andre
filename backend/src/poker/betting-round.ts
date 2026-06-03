/**
 * Single-street betting for Texas Hold'em.
 *
 * Tracks per-player contributions, enforces legal actions and min-raise rules,
 * handles all-ins (partial calls / short raises), and detects when the street is
 * complete. Side-pot construction from the resulting contributions is Step C4.
 *
 * All chip amounts are integers (cents or chips — caller's unit, never floats).
 */

export type ActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise';

export interface Action {
  type: ActionType;
  /** For `bet`: the amount. For `raise`: the total amount to raise *to*. */
  amount?: number;
}

export interface PlayerState {
  id: string;
  stack: number; // chips behind
  committed: number; // chips put in THIS street
  folded: boolean;
  allIn: boolean;
  hasActed: boolean; // acted since the last aggressive action
}

export interface RoundResult {
  /** Total chips contributed this street, per player id (incl. folded players). */
  contributions: Record<string, number>;
  /** Total chips in this street's pot. */
  pot: number;
  /** Players still in the hand (not folded). */
  livePlayerIds: string[];
}

export class BettingRound {
  readonly players: PlayerState[];
  /** Highest amount committed by any player this street. */
  currentBet = 0;
  /** Minimum increment for the next legal raise. */
  private minRaiseSize: number;
  /** Minimum size of an opening bet (the big blind). */
  private readonly minBet: number;
  private toAct: number;

  private constructor(seats: { id: string; stack: number }[], minBet: number, firstToAct: number) {
    if (seats.length < 2) throw new Error('A betting round needs at least 2 players.');
    this.players = seats.map((s) => ({
      id: s.id,
      stack: s.stack,
      committed: 0,
      folded: false,
      allIn: false,
      hasActed: false,
    }));
    this.minBet = minBet;
    this.minRaiseSize = minBet;
    this.toAct = firstToAct % this.players.length;
  }

  /** Postflop street: no blinds, first-to-act given, betting opens at 0. */
  static postflop(
    seats: { id: string; stack: number }[],
    minBet: number,
    firstToAct = 0,
  ): BettingRound {
    return new BettingRound(seats, minBet, firstToAct);
  }

  /**
   * Preflop street: `seats` in order [SB, BB, UTG, ...]. Posts the blinds and
   * sets first-to-act to the player after the big blind (or the SB heads-up).
   */
  static preflop(
    seats: { id: string; stack: number }[],
    smallBlind: number,
    bigBlind: number,
  ): BettingRound {
    const round = new BettingRound(seats, bigBlind, 2 % seats.length);
    round.postBlind(0, smallBlind);
    round.postBlind(1, bigBlind);
    round.currentBet = bigBlind;
    round.minRaiseSize = bigBlind;
    return round;
  }

  private postBlind(index: number, amount: number): void {
    const p = this.players[index];
    const pay = Math.min(amount, p.stack);
    p.stack -= pay;
    p.committed += pay;
    if (p.stack === 0) p.allIn = true;
  }

  /** The id of the player whose turn it is, or null if the round is complete. */
  get actingPlayerId(): string | null {
    return this.isComplete() ? null : this.players[this.toAct].id;
  }

  /** Legal action types for the player to act right now. */
  legalActions(): ActionType[] {
    if (this.isComplete()) return [];
    const p = this.players[this.toAct];
    const toCall = this.currentBet - p.committed;
    const actions: ActionType[] = ['fold'];
    if (toCall <= 0) actions.push('check');
    if (toCall > 0) actions.push('call');
    if (this.currentBet === 0 && p.stack > 0) actions.push('bet');
    // Can raise if there is a bet to raise over and the player has chips beyond a call.
    if (this.currentBet > 0 && p.stack > toCall) actions.push('raise');
    return actions;
  }

  /** Apply an action for `playerId`. Throws on any illegal action. */
  act(playerId: string, action: Action): void {
    if (this.isComplete()) throw new Error('Betting round is already complete.');
    const p = this.players[this.toAct];
    if (p.id !== playerId) throw new Error(`Not ${playerId}'s turn (waiting on ${p.id}).`);

    switch (action.type) {
      case 'fold':
        p.folded = true;
        p.hasActed = true;
        break;

      case 'check':
        if (p.committed !== this.currentBet) {
          throw new Error('Cannot check facing a bet — call, raise, or fold.');
        }
        p.hasActed = true;
        break;

      case 'call': {
        const toCall = this.currentBet - p.committed;
        if (toCall <= 0) throw new Error('Nothing to call — check instead.');
        const pay = Math.min(toCall, p.stack);
        p.stack -= pay;
        p.committed += pay;
        if (p.stack === 0) p.allIn = true;
        p.hasActed = true;
        break;
      }

      case 'bet': {
        if (this.currentBet !== 0) throw new Error('There is already a bet — raise instead.');
        const amount = action.amount ?? 0;
        this.assertInt(amount);
        if (amount <= 0) throw new Error('Bet must be positive.');
        if (amount > p.stack) throw new Error('Bet exceeds stack.');
        // Opening bet must be >= big blind, unless it is an all-in for less.
        if (amount < this.minBet && amount !== p.stack) {
          throw new Error(`Bet must be at least ${this.minBet}.`);
        }
        p.stack -= amount;
        p.committed += amount;
        this.currentBet = p.committed;
        this.minRaiseSize = amount;
        if (p.stack === 0) p.allIn = true;
        this.reopen(p);
        p.hasActed = true;
        break;
      }

      case 'raise': {
        if (this.currentBet === 0) throw new Error('Nothing to raise — bet instead.');
        const raiseTo = action.amount ?? 0;
        this.assertInt(raiseTo);
        if (raiseTo <= this.currentBet) throw new Error('Raise must exceed the current bet.');
        const cost = raiseTo - p.committed;
        if (cost > p.stack) throw new Error('Raise exceeds stack.');
        const increment = raiseTo - this.currentBet;
        const isAllIn = cost === p.stack;
        if (increment < this.minRaiseSize && !isAllIn) {
          throw new Error(`Raise must be at least ${this.minRaiseSize} more (min-raise).`);
        }
        p.stack -= cost;
        p.committed = raiseTo;
        // A full legal raise reopens the action and resets the min-raise size.
        // An all-in short raise does not reopen for players who already acted.
        if (increment >= this.minRaiseSize) {
          this.minRaiseSize = increment;
          this.reopen(p);
        }
        this.currentBet = raiseTo;
        if (p.stack === 0) p.allIn = true;
        p.hasActed = true;
        break;
      }

      default:
        throw new Error(`Unknown action: ${action.type as string}`);
    }

    this.advance();
  }

  /** True once no further action is possible this street. */
  isComplete(): boolean {
    const live = this.players.filter((p) => !p.folded);
    if (live.length <= 1) return true; // everyone else folded
    const active = live.filter((p) => !p.allIn);
    if (active.length === 0) return true; // remaining players all-in
    return active.every((p) => p.hasActed && p.committed === this.currentBet);
  }

  /** Snapshot of this street's contributions and pot. */
  result(carryPot = 0): RoundResult {
    const contributions: Record<string, number> = {};
    let pot = carryPot;
    for (const p of this.players) {
      contributions[p.id] = p.committed;
      pot += p.committed;
    }
    return {
      contributions,
      pot,
      livePlayerIds: this.players.filter((p) => !p.folded).map((p) => p.id),
    };
  }

  // Reset hasActed for everyone else still in the hand and able to act.
  private reopen(aggressor: PlayerState): void {
    for (const p of this.players) {
      if (p !== aggressor && !p.folded && !p.allIn) p.hasActed = false;
    }
  }

  // Advance to the next player who can act; stops if the round is complete.
  private advance(): void {
    if (this.isComplete()) return;
    const n = this.players.length;
    for (let step = 1; step <= n; step++) {
      const idx = (this.toAct + step) % n;
      const p = this.players[idx];
      if (!p.folded && !p.allIn) {
        this.toAct = idx;
        return;
      }
    }
  }

  private assertInt(amount: number): void {
    if (!Number.isInteger(amount)) throw new Error('Amount must be an integer.');
  }
}
