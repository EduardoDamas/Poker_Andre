import { MttTable, MultiTableTournament } from './multi-table';

/**
 * Event-driven coordinator for a live multi-table shootout.
 *
 * Unlike the pure MultiTableTournament (which advances a whole round at once),
 * real tables finish at DIFFERENT times. This collects each table's winner as it
 * reports in, and only advances the bracket once every table in the round is
 * done — then re-seats the survivors into the next round. The gateway drives it:
 * it opens a real poker table per current-round table, and calls
 * reportTableWinner() when that table plays down to one player.
 *
 * Pure logic — no sockets, no DB — so the round/advancement rules are unit-tested
 * in isolation.
 */
export interface CoordinatorEvents {
  /** A new round's tables are ready to be opened for play. */
  onRoundReady?: (tables: MttTable[], round: number) => void;
  /** The tournament resolved to a single champion. */
  onChampion?: (championId: string) => void;
}

export class MultiTableCoordinator {
  private readonly mtt: MultiTableTournament;
  private winners: Record<string, string> = {}; // tableId → winnerId, current round
  private finished = false;

  constructor(
    id: string,
    players: string[],
    private readonly events: CoordinatorEvents = {},
    opts: { minPlayers?: number } = {},
  ) {
    this.mtt = new MultiTableTournament(id, players, opts);
    this.events.onRoundReady?.(this.mtt.tables, this.mtt.round);
  }

  get round(): number {
    return this.mtt.round;
  }
  get currentTables(): MttTable[] {
    return this.mtt.tables;
  }
  get isComplete(): boolean {
    return this.mtt.isComplete;
  }
  get champion(): string | null {
    return this.mtt.champion;
  }

  /** The current-round table a player is seated at, if any. */
  tableOf(playerId: string): MttTable | undefined {
    return this.mtt.tables.find((t) => t.players.includes(playerId));
  }

  /** Ids of current-round tables still waiting to report a winner. */
  pendingTables(): string[] {
    return this.mtt.tables.filter((t) => !this.winners[t.id]).map((t) => t.id);
  }

  /**
   * Report the winner of one current-round table. When every table in the round
   * has reported, the bracket advances (or crowns the champion).
   */
  reportTableWinner(tableId: string, winnerId: string): void {
    if (this.finished) throw new Error('Tournament already complete.');
    const table = this.mtt.tables.find((t) => t.id === tableId);
    if (!table) throw new Error(`Unknown table ${tableId} for the current round.`);
    if (!table.players.includes(winnerId)) {
      throw new Error(`Winner ${winnerId} is not seated at table ${tableId}.`);
    }
    if (this.winners[tableId]) throw new Error(`Table ${tableId} already reported a winner.`);

    this.winners[tableId] = winnerId;
    if (!this.mtt.tables.every((t) => this.winners[t.id])) return; // round not done yet

    const winnersByTableId = this.winners;
    this.winners = {};
    this.mtt.advance(winnersByTableId);

    if (this.mtt.isComplete) {
      this.finished = true;
      this.events.onChampion?.(this.mtt.champion!);
    } else {
      this.events.onRoundReady?.(this.mtt.tables, this.mtt.round);
    }
  }
}
