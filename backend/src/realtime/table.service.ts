import { Injectable } from '@nestjs/common';
import { Card } from '../poker/deck';
import { Action, ActionType } from '../poker/betting-round';
import { PokerHand } from '../poker/hand';
import { SettlementService } from '../wallet/settlement.service';
import { TournamentService, TournamentPayout } from '../tournament/tournament.service';
import { Subscription } from '../tournament/subscription';
import { decideRobotAction } from './bot-brain';
import { FINAL_TABLE_SEATS, SEATS_PER_TABLE } from '../tournament/multi-table';

/** Seats at an ordinary table (lobby rooms and bracket tables). */
const STANDARD_SEATS = SEATS_PER_TABLE;

/**
 * In-memory table state + live hand orchestration for the realtime layer.
 *
 * PRIVACY: hole cards live only inside the server-side PokerHand. The public
 * table/game state never contains them; they go to each owner's socket directly.
 *
 * Money: a hand is played in chips (fixed BUY_IN). Wallets are only touched at
 * showdown, when SettlementService books the result as one double-entry txn.
 * (Funds are verified at settlement; a future hardening step verifies at seat.)
 *
 * State is in-process for now; Step D4 moves live state into Redis for scale.
 */

const BUY_IN = 100; // chips == cents for Phase 1 (practice/cash hands)
const SMALL_BLIND = 1;
const BIG_BLIND = 2;
const TOURNEY_STARTING_STACK = 1000; // tournament chips (not money)

// Tournament blind schedule (client spec): the minimum bet (big blind) starts
// at 50 chips and doubles automatically every 3 rounds. Small blind is half.
const TOURNEY_BIG_BLIND_START = 50;
const TOURNEY_BLIND_DOUBLE_EVERY = 3; // hands (rounds)

/**
 * Blinds for a tournament hand given how many hands have already been dealt.
 * `handsPlayed` is 0-based, so the first hand → level 0 → big blind 50:
 *   hands 1–3 → BB 50 / SB 25, hands 4–6 → BB 100 / SB 50, hands 7–9 → BB 200, …
 * The big blind IS the table's minimum bet; it doubles every 3 rounds.
 */
export function tournamentBlinds(handsPlayed: number): { smallBlind: number; bigBlind: number } {
  const level = Math.floor(handsPlayed / TOURNEY_BLIND_DOUBLE_EVERY);
  const bigBlind = TOURNEY_BIG_BLIND_START * 2 ** level;
  return { smallBlind: Math.floor(bigBlind / 2), bigBlind };
}

interface SeatSlot {
  userId: string;
  socketId: string;
  isRobot?: boolean;
}

/**
 * Single-table elimination tournament context. Money moves ONCE: each real
 * player's entry fee (V.I.) is escrowed on join, and the last player standing
 * is paid the prize at the end. Between those, play is in tournament CHIPS
 * (TOURNEY_STARTING_STACK), carried across hands until a player busts to 0.
 */
interface TournamentCtx {
  level: number;
  capacity: number; // seats defining 100% occupancy (= maxSeats)
  entries: Map<string, Subscription>; // real players who paid, by userId
  stacks: Record<string, number>; // persistent chip stacks across hands
  eliminated: Set<string>;
  started: boolean;
  settled: boolean;
  handsPlayed: number; // hands dealt so far — drives the blind schedule
  // A sub-table of a multi-table tournament: it plays to one winner in chips but
  // NEVER settles money here. Entries are escrowed once at tournament registration
  // and the prize is settled once for the champion (see MultiTableCoordinator).
  // With no money at stake here, the last player left wins the table even when
  // the others withdrew — a bracket must never stall on someone who walked away.
  subTable: boolean;
}

interface Table {
  id: string;
  maxSeats: number;
  seats: (SeatSlot | null)[];
  handInProgress: boolean;
  hand: PokerHand | null;
  buyIns: Record<string, bigint>;
  handCount: number;
  tournament: TournamentCtx | null;
}

export interface PublicSeat {
  position: number;
  userId: string;
  hasCards: boolean;
}

export interface PublicTableState {
  id: string;
  maxSeats: number;
  handInProgress: boolean;
  seats: (PublicSeat | null)[];
}

export interface GameState {
  tableId: string;
  street: string;
  board: Card[];
  actingPlayerId: string | null;
  legalActions: ActionType[];
  actingStack: number; // chips behind the player to act (for sizing all-ins)
  actingCommitted: number; // chips they've already put in this street
}

export interface TournamentStatus {
  over: boolean;
  remaining: number;
  winnerId?: string;
  prizeCents?: number; // money paid to the winner (cents)
  multiplier?: number;
  // Everyone else WITHDREW (not busted): no payout — the table went back to
  // "waiting for players" so the survivor plays when someone new joins.
  reverted?: boolean;
  // Players who busted to zero chips on this hand.
  busted?: string[];
}

export interface HandResultPayload {
  board: Card[];
  pots: { amount: number; winnerIds: string[] }[];
  payouts: Record<string, number>;
  finalStacks: Record<string, number>;
  tournament?: TournamentStatus;
}

@Injectable()
export class TableService {
  private readonly tables = new Map<string, Table>();

  constructor(
    private readonly settlement: SettlementService,
    private readonly tournament: TournamentService,
  ) {}

  getTable(id: string): Table | undefined {
    return this.tables.get(id);
  }

  /**
   * [maxAllowed] caps the seats. Lobby rooms are created by a client's join, so
   * they stay at 8 whatever the client asks; only server-created tournament
   * tables may seat a final table of up to 10.
   */
  private getOrCreate(id: string, maxSeats = 8, maxAllowed = STANDARD_SEATS): Table {
    let table = this.tables.get(id);
    if (!table) {
      const seats = Math.min(Math.max(maxSeats, 2), maxAllowed);
      table = {
        id,
        maxSeats: seats,
        seats: new Array(seats).fill(null),
        handInProgress: false,
        hand: null,
        buyIns: {},
        handCount: 0,
        tournament: null,
      };
      this.tables.set(id, table);
    }
    return table;
  }

  isTournament(table: Table): boolean {
    return table.tournament !== null;
  }

  /**
   * Mark a table as a money tournament for [level]. Idempotent; only allowed
   * before the first hand. Returns the (now tournament-mode) table.
   */
  enableTournament(id: string, level: number, maxSeats = 8, opts: { subTable?: boolean } = {}): Table {
    const table = this.getOrCreate(id, maxSeats, opts.subTable ? FINAL_TABLE_SEATS : STANDARD_SEATS);
    if (!table.tournament && !table.handInProgress) {
      table.tournament = {
        level,
        capacity: table.maxSeats,
        entries: new Map(),
        stacks: {},
        eliminated: new Set(),
        started: false,
        settled: false,
        handsPlayed: 0,
        subTable: opts.subTable ?? false,
      };
    }
    return table;
  }

  /**
   * Record that a real player paid the entry fee and joins the tournament with a
   * fresh chip stack. Call AFTER the gateway has escrowed their entry.
   */
  recordTournamentEntry(table: Table, userId: string, subscription: Subscription): void {
    const t = table.tournament;
    if (!t) throw new Error('Not a tournament table.');
    if (!t.entries.has(userId)) {
      t.entries.set(userId, subscription);
      t.stacks[userId] = TOURNEY_STARTING_STACK;
    }
  }

  /**
   * Escrow a real player's entry fee and seat them in the tournament with a
   * fresh chip stack. Idempotent: a reconnecting/duplicate join does not
   * double-charge. Throws (insufficient balance) only on the first entry.
   */
  async enterTournament(table: Table, userId: string, subscription: Subscription): Promise<void> {
    const t = table.tournament;
    if (!t) return;
    if (t.entries.has(userId)) {
      if (!t.eliminated.has(userId)) return; // already in and live
      if (t.started && !t.settled) {
        // Withdrew from a RUNNING tournament — out until this one ends.
        throw new Error('Você saiu deste torneio. Aguarde a próxima partida.');
      }
      // Not started (e.g. the table reverted to waiting): the paid entry is
      // still valid — reinstate with a fresh stack.
      t.eliminated.delete(userId);
      t.stacks[userId] = TOURNEY_STARTING_STACK;
      return;
    }
    await this.tournament.escrowEntry({
      tournamentId: table.id,
      userId,
      level: t.level,
      subscription,
    });
    this.recordTournamentEntry(table, userId, subscription);
  }

  /** Real, paid, not-yet-eliminated players still in the tournament. */
  private liveEntrants(table: Table): string[] {
    const t = table.tournament!;
    return [...t.entries.keys()].filter((id) => !t.eliminated.has(id) && (t.stacks[id] ?? 0) > 0);
  }

  tournamentReadyToStart(table: Table): boolean {
    const t = table.tournament;
    if (!t || t.started || table.handInProgress) return false;
    return this.liveEntrants(table).length >= 2;
  }

  /**
   * Everyone else withdrew: no payout — put the table back into "waiting for
   * players". Survivors keep their (still valid) entries with fresh stacks and
   * the game starts again when someone new joins.
   */
  private revertToWaiting(table: Table): void {
    const t = table.tournament!;
    t.started = false;
    t.handsPlayed = 0;
    table.hand = null;
    table.handInProgress = false;
    for (const id of this.liveEntrants(table)) t.stacks[id] = TOURNEY_STARTING_STACK;
  }

  join(
    id: string,
    userId: string,
    socketId: string,
    maxSeats?: number,
  ): { table: Table; position: number; rejoined: boolean } {
    const table = this.getOrCreate(id, maxSeats);
    const existing = table.seats.findIndex((s) => s?.userId === userId);
    if (existing !== -1) {
      const seat = table.seats[existing]!;
      // Same live socket joining twice → genuine error.
      if (seat.socketId === socketId) throw new Error('Already seated at this table.');
      // A returning player (new socket) re-binds to their seat.
      seat.socketId = socketId;
      return { table, position: existing, rejoined: true };
    }
    // Prefer an empty seat. If the room is full of robots and no hand is
    // running, bump a robot so a real player can take its place.
    let position = table.seats.findIndex((s) => s === null);
    if (position === -1 && !table.handInProgress) {
      position = table.seats.findIndex((s) => s?.isRobot);
    }
    if (position === -1) throw new Error('Table is full.');
    table.seats[position] = { userId, socketId };
    return { table, position, rejoined: false };
  }

  /** Fill empty seats with robots (used to make a waiting room feel active). */
  fillWithRobots(table: Table): number {
    let added = 0;
    for (let i = 0; i < table.seats.length; i++) {
      if (table.seats[i] === null) {
        added += 1;
        table.seats[i] = { userId: `robot${i + 1}`, socketId: `robot:${table.id}:${i}`, isRobot: true };
      }
    }
    return added;
  }

  /** Seat a promotion rehearsal's robot at its bracket table. */
  seatRobot(id: string, userId: string): void {
    const table = this.tables.get(id);
    if (!table || table.seats.some((s) => s?.userId === userId)) return;
    const i = table.seats.findIndex((s) => s === null);
    if (i !== -1) table.seats[i] = { userId, socketId: `robot:${id}:${userId}`, isRobot: true };
  }

  hasRobots(table: Table): boolean {
    return this.seatedSlots(table).some((s) => s.isRobot);
  }

  realPlayerCount(table: Table): number {
    return this.seatedSlots(table).filter((s) => !s.isRobot).length;
  }

  isRobotSeat(table: Table, userId: string): boolean {
    return this.seatedSlots(table).some((s) => s.userId === userId && s.isRobot);
  }

  /**
   * Re-associate a reconnecting player's seat with a new socket. The hand is
   * never abandoned on disconnect, so the player resumes exactly where they were.
   */
  reconnect(id: string, userId: string, socketId: string): { table: Table; position: number } {
    const table = this.tables.get(id);
    if (!table) throw new Error('Table not found.');
    const position = table.seats.findIndex((s) => s?.userId === userId);
    if (position === -1) throw new Error('Not seated at this table.');
    table.seats[position]!.socketId = socketId;
    return { table, position };
  }

  /**
   * Leave the table.
   *
   * Casual tables keep the old behavior (leaving mid-hand abandons it; nothing
   * was escrowed). For a STARTED money tournament, leaving is a WITHDRAWAL:
   * the player is out for good (their entry stays in the prize pool), a live
   * hand folds them — immediately if it is their turn, otherwise the gateway
   * auto-folds their empty seat when the action reaches it — and the remaining
   * players keep competing. When only one live entrant remains, the tournament
   * settles to that player (walkover) and the result payload is returned for
   * the gateway to broadcast. Leaving BEFORE the first hand only vacates the
   * seat: the paid entry stays valid and the player may return.
   */
  async leave(
    id: string,
    userId: string,
  ): Promise<{ table: Table; result?: HandResultPayload; reverted?: boolean; withdrew?: boolean } | null> {
    const table = this.tables.get(id);
    if (!table) return null;
    const idx = table.seats.findIndex((s) => s?.userId === userId);
    if (idx !== -1) table.seats[idx] = null;

    const t = table.tournament;
    if (!t) {
      // Casual table: leaving mid-hand abandons it (no settlement; chips were
      // never escrowed).
      if (this.seatedSlots(table).length < 2) {
        table.hand = null;
        table.handInProgress = false;
      }
      return { table };
    }

    // Not entered, already out, or the tournament never started — just vacate
    // the seat. A paid entry before the first hand stays valid for a return.
    if (!t.entries.has(userId) || t.eliminated.has(userId) || !t.started || t.settled) {
      return { table };
    }

    // Withdrawal: the player is out; their entry stays in the pool.
    t.eliminated.add(userId);

    // If it is the leaver's turn in a live hand, fold them now so play resumes.
    if (table.hand && !table.hand.isComplete() && table.hand.actingPlayerId === userId) {
      try {
        table.hand.act(userId, { type: 'fold' });
      } catch {
        /* not in this hand — nothing to fold */
      }
    }

    // The fold may have finished the hand (everyone else had folded already).
    if (table.hand?.isComplete()) {
      const out = table.hand.result();
      const payload: HandResultPayload = {
        board: out.board,
        pots: out.pots.map((p) => ({ amount: p.amount, winnerIds: p.winnerIds })),
        payouts: out.payouts,
        finalStacks: out.finalStacks,
      };
      table.hand = null;
      table.handInProgress = false;
      payload.tournament = await this.applyTournamentHandResult(table, out.finalStacks);
      return { table, result: payload, withdrew: true };
    }

    // A bracket table between hands: the last one left wins it (no money here).
    if (t.subTable && !table.handInProgress) {
      const live = this.liveEntrants(table);
      if (live.length === 1) {
        t.settled = true;
        const result: HandResultPayload = {
          board: [],
          pots: [],
          payouts: {},
          finalStacks: { ...t.stacks },
          tournament: { over: true, remaining: 1, winnerId: live[0], busted: [] },
        };
        return { table, result, withdrew: true };
      }
      return { table, withdrew: true };
    }

    // Between hands (or the hand continues without them): withdrawals never
    // pay a walkover — with one live entrant left the table goes back to
    // "waiting for players"; with none left the abandoned instance is closed
    // (entries released so the room restarts clean).
    if (!table.handInProgress) {
      const live = this.liveEntrants(table);
      if (live.length === 1) {
        this.revertToWaiting(table);
        return { table, reverted: true, withdrew: true };
      }
      if (live.length === 0 && !t.settled) {
        await this.tournament.releaseReferences(id, [...t.entries.keys()], `abandoned-${id}-${Date.now()}`);
        this.tables.delete(id);
        return { table, withdrew: true };
      }
    }
    return { table, withdrew: true };
  }

  /** The acting player's id when their seat is empty (they left mid-hand). */
  absentToAct(table: Table): string | null {
    const id = table.hand?.actingPlayerId;
    if (!id) return null;
    return this.seatedSlots(table).some((s) => s.userId === id) ? null : id;
  }

  /**
   * Drop a SETTLED (non-sub) tournament table from the registry so the static
   * lobby room (poker-l1..l7) reads 0/8 again and the next group gets a fresh
   * tournament. Without this, a finished tournament bricks its room: seats of
   * players still viewing the result keep counting, and startTournamentHand
   * refuses to deal on a settled table forever.
   */
  resetSettled(id: string): boolean {
    const table = this.tables.get(id);
    if (table?.tournament?.settled && !table.tournament.subTable) {
      this.tables.delete(id);
      return true;
    }
    return false;
  }

  /** True when a disconnect must NOT free this table's seats immediately:
   *  a running money tournament, or any hand in progress (reconnect support). */
  private protectsSeatOnDisconnect(table: Table): boolean {
    const t = table.tournament;
    return (!!t && t.started && !t.settled) || table.handInProgress;
  }

  /** Seats this socket holds that are protected on disconnect — the gateway
   *  schedules a grace timer to withdraw them if the player doesn't return. */
  liveSeatsOf(socketId: string): { tableId: string; userId: string }[] {
    const out: { tableId: string; userId: string }[] = [];
    for (const table of this.tables.values()) {
      if (!this.protectsSeatOnDisconnect(table)) continue;
      const seat = table.seats.find((s) => s?.socketId === socketId);
      if (seat) out.push({ tableId: table.id, userId: seat.userId });
    }
    return out;
  }

  /**
   * A socket dropped (app killed, network gone): free its seats so the lobby
   * doesn't show ghost occupancy — EXCEPT in a live money tournament (started,
   * unsettled), where the seat is kept so the player can rejoin; there the
   * gateway schedules a grace timer that withdraws them if they don't return.
   * Returns the changed tables.
   */
  vacateDisconnected(socketId: string): Table[] {
    const changed: Table[] = [];
    for (const table of this.tables.values()) {
      if (this.protectsSeatOnDisconnect(table)) continue; // rejoinable — grace timer
      const idx = table.seats.findIndex((s) => s?.socketId === socketId);
      if (idx === -1) continue;
      table.seats[idx] = null;
      changed.push(table);
    }
    return changed;
  }

  seatedCount(table: Table): number {
    return this.seatedSlots(table).length;
  }

  /** Start a new hand if ≥2 are seated and none is in progress. */
  startHand(table: Table): boolean {
    if (table.tournament) return this.startTournamentHand(table);

    const seated = this.seatedSlots(table);
    if (table.handInProgress || seated.length < 2) return false;

    table.buyIns = {};
    for (const s of seated) table.buyIns[s.userId] = BigInt(BUY_IN);
    table.hand = new PokerHand(
      seated.map((s) => ({ id: s.userId, stack: BUY_IN })),
      { smallBlind: SMALL_BLIND, bigBlind: BIG_BLIND },
    );
    table.handInProgress = true;
    return true;
  }

  // Tournament hand: seat only the live entrants, each with their CURRENT chip
  // stack carried over from previous hands. No per-hand money settlement.
  private startTournamentHand(table: Table): boolean {
    const t = table.tournament!;
    if (table.handInProgress || t.settled) return false;
    const live = this.liveEntrants(table);
    if (live.length < 2) return false;

    t.started = true;
    table.hand = new PokerHand(
      live.map((id) => ({ id, stack: t.stacks[id] })),
      tournamentBlinds(t.handsPlayed),
    );
    t.handsPlayed += 1;
    table.handInProgress = true;
    return true;
  }

  seatedPlayers(table: Table): SeatSlot[] {
    return this.seatedSlots(table);
  }

  holeFor(table: Table, userId: string): [Card, Card] | undefined {
    return table.handInProgress ? table.hand?.holeCardsOf(userId) : undefined;
  }

  publicState(table: Table): PublicTableState {
    return {
      id: table.id,
      maxSeats: table.maxSeats,
      handInProgress: table.handInProgress,
      seats: table.seats.map((s, position) =>
        s ? { position, userId: s.userId, hasCards: table.handInProgress } : null,
      ),
    };
  }

  gameState(table: Table): GameState | null {
    if (!table.hand) return null;
    return {
      tableId: table.id,
      street: table.hand.currentStreet,
      board: table.hand.board,
      actingPlayerId: table.hand.actingPlayerId,
      legalActions: table.hand.legalActions(),
      actingStack: table.hand.actingStack,
      actingCommitted: table.hand.actingCommitted,
    };
  }

  /**
   * Apply a player's action. When the hand completes, settle it into the ledger
   * and return the result payload.
   */
  async act(
    tableId: string,
    userId: string,
    action: Action,
  ): Promise<{ complete: false } | { complete: true; result: HandResultPayload }> {
    const table = this.tables.get(tableId);
    if (!table?.hand) throw new Error('No hand in progress at this table.');

    table.hand.act(userId, action);

    if (!table.hand.isComplete()) return { complete: false };

    const out = table.hand.result();

    const payload: HandResultPayload = {
      board: out.board,
      pots: out.pots.map((p) => ({ amount: p.amount, winnerIds: p.winnerIds })),
      payouts: out.payouts,
      finalStacks: out.finalStacks,
    };
    table.hand = null;
    table.handInProgress = false;

    if (table.tournament) {
      payload.tournament = await this.applyTournamentHandResult(table, out.finalStacks);
    } else if (!this.hasRobots(table)) {
      // No deductions in robot/mixed matches — only ALL-real cash hands settle.
      await this.settle(table, out.finalStacks);
    }

    return { complete: true, result: payload };
  }

  /**
   * After a tournament hand: carry over chip stacks, eliminate busted players,
   * and if only one entrant remains, settle the money prize to the winner.
   * Returns tournament status for the gateway to broadcast.
   */
  private async applyTournamentHandResult(
    table: Table,
    finalStacks: Record<string, number>,
  ): Promise<TournamentStatus> {
    const t = table.tournament!;
    const busted: string[] = [];
    for (const id of t.entries.keys()) {
      if (finalStacks[id] !== undefined) t.stacks[id] = finalStacks[id];
      if ((t.stacks[id] ?? 0) <= 0 && !t.eliminated.has(id)) {
        t.eliminated.add(id);
        busted.push(id);
      }
    }

    const live = this.liveEntrants(table);
    if (live.length > 1) {
      return { over: false, remaining: live.length, busted };
    }

    // Only one live entrant. A prize is paid only when the tournament was WON
    // BY PLAY (everyone else busted to zero chips). If any opponent withdrew
    // while still holding chips, there is no walkover payout: the table goes
    // back to "waiting for players" and the survivor plays on when someone
    // new joins.
    const wonByPlay = [...t.entries.keys()].every(
      (id) => live.includes(id) || (t.stacks[id] ?? 0) <= 0,
    );
    if (!wonByPlay && !t.subTable) {
      this.revertToWaiting(table);
      return { over: false, remaining: live.length, reverted: true, busted };
    }

    // Tournament over — the last player standing wins this table.
    const winnerId = live[0] ?? [...t.entries.keys()].find((id) => !t.eliminated.has(id))!;

    // Sub-table of a bigger tournament: report the winner but move NO money here.
    if (t.subTable) {
      t.settled = true;
      return { over: true, remaining: 1, winnerId, busted };
    }

    let payout: TournamentPayout | undefined;
    if (!t.settled) {
      t.settled = true;
      payout = await this.tournament.settle({
        tournamentId: table.id,
        level: t.level,
        winnerId,
        winnerSubscription: t.entries.get(winnerId) ?? 'NONE',
        participants: [...t.entries.entries()].map(([userId, subscription]) => ({
          userId,
          subscription,
        })),
        capacity: t.capacity,
      });
    }
    return {
      over: true,
      remaining: 1,
      winnerId,
      prizeCents: payout ? Number(payout.winnerCents) : undefined,
      multiplier: payout?.multiplier,
      busted,
    };
  }

  private async settle(table: Table, finalStacks: Record<string, number>): Promise<void> {
    const seats = Object.entries(table.buyIns).map(([userId, buyInCents]) => ({
      userId,
      buyInCents,
      finalStackCents: BigInt(finalStacks[userId] ?? 0),
    }));
    table.handCount += 1;
    await this.settlement.settleHand({ handId: `${table.id}#${table.handCount}`, seats });
  }

  /** The current actor's id if it's a robot, else null (for the gateway driver). */
  robotToAct(table: Table): string | null {
    const acting = table.hand?.actingPlayerId;
    if (!acting) return null;
    return this.isRobotSeat(table, acting) ? acting : null;
  }

  /** Decide the current robot's action from the engine state. */
  robotDecision(table: Table): Action {
    const acting = table.hand!.actingPlayerId!;
    const d = decideRobotAction(
      table.hand!.holeCardsOf(acting),
      table.hand!.board,
      table.hand!.legalActions(),
    );
    return d as Action;
  }

  private seatedSlots(table: Table): SeatSlot[] {
    return table.seats.filter((s): s is SeatSlot => s !== null);
  }
}
