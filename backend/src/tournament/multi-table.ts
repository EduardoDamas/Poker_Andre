/**
 * Multi-table "shootout" tournament structure (server-authoritative).
 *
 * Players are split across tables of up to 8. Each table plays down to ONE
 * winner; the winners advance to the next round and are re-seated into new
 * tables. This repeats until a single champion remains — the client's model
 * ("os vencedores de cada mesa passam para a próxima até restar um").
 *
 * Config: min 10 tables (80 players) to start, max 100 tables (800 players).
 *
 * This module is PURE bracket/structure logic — no DB, no sockets. The realtime
 * layer plays each table's hands with the existing PokerHand engine and reports
 * the winner of each table via advance(). MONEY settles only ONCE, for the final
 * champion (via TournamentService.settle) — never per intermediate table.
 */

export const SEATS_PER_TABLE = 8;
export const MIN_TABLES_TO_START = 10;
export const MAX_TABLES = 100;
export const MIN_PLAYERS = MIN_TABLES_TO_START * SEATS_PER_TABLE; // 80
export const MAX_PLAYERS = MAX_TABLES * SEATS_PER_TABLE; // 800

export interface MttTable {
  id: string;
  round: number;
  players: string[]; // 2..8 userIds seated here this round
}

/** Split players evenly into tables of up to 8 (table sizes differ by at most 1). */
export function seatIntoTables(players: string[], round: number, tournamentId: string): MttTable[] {
  const count = players.length;
  const numTables = Math.min(Math.max(1, Math.ceil(count / SEATS_PER_TABLE)), MAX_TABLES);
  const tables: MttTable[] = Array.from({ length: numTables }, (_, i) => ({
    id: `${tournamentId}-r${round}-t${i + 1}`,
    round,
    players: [],
  }));
  // Round-robin deal keeps tables balanced.
  players.forEach((p, i) => tables[i % numTables].players.push(p));
  return tables;
}

/** Whether a tournament may start with this many registered players. */
export function canStart(playerCount: number, minPlayers = MIN_PLAYERS): boolean {
  return playerCount >= minPlayers && playerCount <= MAX_PLAYERS;
}

/**
 * Auto-join: the room a logging-in player should be routed to — the one with the
 * MOST waiting players that still has room and hasn't started. Returns its id, or
 * null if none is joinable.
 */
export function pickFullestRoom(
  rooms: { id: string; waiting: number; capacity: number; started: boolean }[],
): string | null {
  const joinable = rooms
    .filter((r) => !r.started && r.waiting < r.capacity)
    .sort((a, b) => b.waiting - a.waiting);
  return joinable[0]?.id ?? null;
}

export class MultiTableTournament {
  readonly id: string;
  private _round = 0;
  private _tables: MttTable[] = [];
  private _alive: string[];
  private _champion: string | null = null;

  constructor(id: string, players: string[], opts: { minPlayers?: number } = {}) {
    const min = opts.minPlayers ?? MIN_PLAYERS;
    if (players.length < min) {
      throw new Error(`Need at least ${min} players to start (got ${players.length}).`);
    }
    if (players.length > MAX_PLAYERS) {
      throw new Error(`At most ${MAX_PLAYERS} players allowed (got ${players.length}).`);
    }
    if (new Set(players).size !== players.length) {
      throw new Error('Duplicate players in the roster.');
    }
    this.id = id;
    this._alive = [...players];
    this.nextRound();
  }

  private nextRound(): void {
    this._round += 1;
    this._tables = seatIntoTables(this._alive, this._round, this.id);
  }

  get round(): number {
    return this._round;
  }
  get tables(): MttTable[] {
    return this._tables;
  }
  get aliveCount(): number {
    return this._alive.length;
  }
  get isComplete(): boolean {
    return this._champion !== null;
  }
  get champion(): string | null {
    return this._champion;
  }

  /**
   * Report the winner of each current table (map tableId → winning userId,
   * exactly one per current table) and advance. When a single table remains, its
   * winner becomes the tournament champion.
   */
  advance(winnersByTableId: Record<string, string>): void {
    if (this._champion) throw new Error('Tournament already complete.');
    const winners: string[] = [];
    for (const table of this._tables) {
      const w = winnersByTableId[table.id];
      if (!w) throw new Error(`Missing winner for table ${table.id}.`);
      if (!table.players.includes(w)) {
        throw new Error(`Winner ${w} is not seated at table ${table.id}.`);
      }
      winners.push(w);
    }
    this._alive = winners;
    if (winners.length === 1) {
      this._champion = winners[0];
      this._tables = [];
      return;
    }
    this.nextRound();
  }
}
