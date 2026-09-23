import { randomInt } from 'crypto';
import { Injectable } from '@nestjs/common';
import { MultiTableCoordinator } from '../tournament/multi-table-coordinator';
import { MttTable } from '../tournament/multi-table';
import { Subscription } from '../tournament/subscription';

export interface PromoBracketConfig {
  eventId: string;
  roomId: string;
  startsAt: Date;
  minPlayers: number;
  maxPlayers: number;
  /** Minutes past startsAt after which 2+ present players start anyway; null = never. */
  waitMinutes: number | null;
}

interface Entrant {
  socketId: string;
  connected: boolean;
  subscription: Subscription;
}

/** What a finished table did to the bracket. */
export interface TableOutcome {
  /** The next round's tables, when this was the round's last table to finish. */
  nextRound?: MttTable[];
  /** Tables of the current round still playing. */
  tablesLeft: number;
}

/**
 * One promotion played as a multi-table bracket (client, 2026-09-22): tables
 * play down to one winner, the winners meet at a final table, one champion.
 *
 * Pure state — no sockets, no database. The gateway feeds it joins, leaves,
 * disconnects and table winners, and does the I/O it asks for.
 *
 * Before the start, only players with the app open hold a place: a dropped
 * connection frees it (and reconnecting takes it back while places remain),
 * so "só joga quem estiver com o app aberto" holds when the tournament starts.
 */
export class PromoBracket {
  private readonly entrants = new Map<string, Entrant>();
  private coordinator: MultiTableCoordinator | null = null;
  private readonly alive = new Set<string>();
  private readonly subscriptionsAtStart = new Map<string, Subscription>();
  private pendingRound: MttTable[] = [];
  private _champion: string | null = null;
  private _startedWith = 0;

  constructor(readonly config: PromoBracketConfig) {}

  get roomId(): string {
    return this.config.roomId;
  }
  get eventId(): string {
    return this.config.eventId;
  }
  get started(): boolean {
    return this.coordinator !== null;
  }
  get finished(): boolean {
    return this._champion !== null;
  }
  get champion(): string | null {
    return this._champion;
  }
  /** Players holding a place (before the start) — what the lobby shows. */
  get registered(): number {
    return this.entrants.size;
  }
  /** How many started the tournament. */
  get startedWith(): number {
    return this._startedWith;
  }
  get aliveCount(): number {
    return this.alive.size;
  }
  get round(): number {
    return this.coordinator?.round ?? 0;
  }

  /** When 2+ present players start even below the minimum, if ever. */
  get startAnywayAt(): Date | null {
    const { startsAt, waitMinutes } = this.config;
    return waitMinutes === null ? null : new Date(startsAt.getTime() + waitMinutes * 60_000);
  }

  /**
   * Take a place, or re-bind a held one to a new connection. Throws when the
   * tournament already runs (see rejoin) or the places are gone.
   */
  register(userId: string, socketId: string, subscription: Subscription): 'joined' | 'rejoined' {
    if (this.started) throw new Error('O torneio da promoção já começou.');
    const held = this.entrants.get(userId);
    if (held) {
      held.socketId = socketId;
      held.connected = true;
      held.subscription = subscription;
      return 'rejoined';
    }
    if (this.entrants.size >= this.config.maxPlayers) {
      throw new Error('As vagas desta promoção se esgotaram.');
    }
    this.entrants.set(userId, { socketId, connected: true, subscription });
    return 'joined';
  }

  /** Give the place back before the start ("Sair da mesa"). */
  leave(userId: string): boolean {
    return !this.started && this.entrants.delete(userId);
  }

  /**
   * A connection dropped. Before the start its place is freed; afterwards the
   * player is marked away (their table auto-folds them until they return or
   * the grace period withdraws them). Returns the players affected.
   */
  dropSocket(socketId: string): string[] {
    const affected: string[] = [];
    for (const [userId, e] of this.entrants) {
      if (e.socketId !== socketId) continue;
      affected.push(userId);
      if (this.started) e.connected = false;
      else this.entrants.delete(userId);
    }
    return affected;
  }

  /** A running tournament's entrant came back on a new connection. */
  rebind(userId: string, socketId: string): void {
    const e = this.entrants.get(userId);
    if (e) {
      e.socketId = socketId;
      e.connected = true;
    }
  }

  entrant(userId: string): Readonly<Entrant> | undefined {
    return this.entrants.get(userId);
  }

  entrantIds(): string[] {
    return [...this.entrants.keys()];
  }

  isAlive(userId: string): boolean {
    return this.alive.has(userId);
  }

  /**
   * May it start now? At/after startsAt with the minimum present; or, once the
   * tolerance has passed, with anyone who is there (2 or more).
   */
  shouldStart(now: number): boolean {
    if (this.started) return false;
    const present = this.entrants.size;
    if (now < this.config.startsAt.getTime() || present < 2) return false;
    if (present >= this.config.minPlayers) return true;
    const anyway = this.startAnywayAt;
    return anyway !== null && now >= anyway.getTime();
  }

  /** The moments at which shouldStart can flip by the clock alone. */
  startChecks(now: number): number[] {
    return [this.config.startsAt.getTime(), this.startAnywayAt?.getTime()]
      .filter((t): t is number => t !== undefined && t >= now);
  }

  /**
   * Start with everyone holding a place, seated at random. [subscriptions] is
   * each player's plan read right now — "assinante até o início do torneio".
   * Returns the first round's tables.
   */
  start(subscriptions: Map<string, Subscription>): MttTable[] {
    if (this.started) throw new Error('Already started.');
    const players = shuffle(this.entrantIds());
    for (const id of players) {
      this.subscriptionsAtStart.set(id, subscriptions.get(id) ?? this.entrants.get(id)!.subscription);
      this.alive.add(id);
    }
    this._startedWith = players.length;
    this.coordinator = new MultiTableCoordinator(
      this.roomId,
      players,
      {
        onRoundReady: (tables) => (this.pendingRound = tables),
        onChampion: (id) => (this._champion = id),
      },
      { minPlayers: 2 },
    );
    return this.takePendingRound();
  }

  /** Whether the champion counts as a subscriber (plan held at the start). */
  subscribedAtStart(userId: string): boolean {
    return (this.subscriptionsAtStart.get(userId) ?? 'NONE') !== 'NONE';
  }

  subscriptionOf(userId: string): Subscription {
    return this.subscriptionsAtStart.get(userId) ?? 'NONE';
  }

  /** The current-round table of a player still in the tournament. */
  tableOf(userId: string): string | undefined {
    if (!this.alive.has(userId)) return undefined;
    return this.coordinator?.tableOf(userId)?.id;
  }

  /** Is [tableId] one of the current round's tables? */
  hasTable(tableId: string): boolean {
    return !!this.coordinator?.currentTables.some((t) => t.id === tableId);
  }

  /** The final table: the only table of its round. */
  isFinal(tableId: string): boolean {
    const tables = this.coordinator?.currentTables ?? [];
    return tables.length === 1 && tables[0].id === tableId;
  }

  /** Winners of finished tables waiting for the rest of the round. */
  waitingWinners(): string[] {
    const c = this.coordinator;
    if (!c) return [];
    const pending = new Set(c.pendingTables());
    return c.currentTables
      .filter((t) => !pending.has(t.id))
      .flatMap((t) => t.players.filter((p) => this.alive.has(p)));
  }

  tablesLeft(): number {
    return this.coordinator?.pendingTables().length ?? 0;
  }

  /**
   * Players knocked out (busted or withdrawn). Returns the place they finished
   * in — shared when several go out on the same hand.
   */
  knockOut(userIds: string[]): number {
    for (const id of userIds) this.alive.delete(id);
    return this.alive.size + 1;
  }

  /** A table played down to [winnerId]: everyone else there is out. */
  tableWon(tableId: string, winnerId: string): TableOutcome {
    const c = this.coordinator;
    if (!c) throw new Error('Not started.');
    const table = c.currentTables.find((t) => t.id === tableId);
    if (!table) throw new Error(`Unknown table ${tableId}.`);
    for (const p of table.players) if (p !== winnerId) this.alive.delete(p);
    c.reportTableWinner(tableId, winnerId);
    const nextRound = this.takePendingRound();
    return { nextRound: nextRound.length ? nextRound : undefined, tablesLeft: this.tablesLeft() };
  }

  private takePendingRound(): MttTable[] {
    const tables = this.pendingRound;
    this.pendingRound = [];
    return tables;
  }
}

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * The live brackets, by promotion room — shared by the gateway (which plays
 * them) and the lobby (which shows how many hold a place).
 */
@Injectable()
export class PromoBrackets {
  private readonly byRoom = new Map<string, PromoBracket>();
  private readonly roomOfTable = new Map<string, string>();

  get(roomId: string): PromoBracket | undefined {
    return this.byRoom.get(roomId);
  }

  getOrCreate(config: PromoBracketConfig): PromoBracket {
    let bracket = this.byRoom.get(config.roomId);
    if (!bracket) {
      bracket = new PromoBracket(config);
      this.byRoom.set(config.roomId, bracket);
    }
    return bracket;
  }

  all(): PromoBracket[] {
    return [...this.byRoom.values()];
  }

  /** Remember which bracket a table belongs to. */
  indexTable(tableId: string, roomId: string): void {
    this.roomOfTable.set(tableId, roomId);
  }

  /** The bracket playing [tableId], if any. */
  forTable(tableId: string): PromoBracket | undefined {
    const roomId = this.roomOfTable.get(tableId);
    return roomId ? this.byRoom.get(roomId) : undefined;
  }
}
