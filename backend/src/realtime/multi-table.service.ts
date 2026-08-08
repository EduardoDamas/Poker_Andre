import { Injectable, Optional } from '@nestjs/common';
import { Subscription } from '../tournament/subscription';
import { TournamentService, TournamentPayout } from '../tournament/tournament.service';
import { MultiTableTournament, MAX_PLAYERS } from '../tournament/multi-table';
import { AdminNotificationService } from '../notifications/admin-notification.service';
import { playTableWithBots } from './table-runner';

/** Resolves a table's seated players down to its single winner's id. */
export type TableResolver = (players: string[]) => string;

export interface MultiTableParticipant {
  userId: string;
  subscription: Subscription;
}

export interface MultiTableResult {
  championId: string;
  rounds: number;
  payout: TournamentPayout;
}

/**
 * Orchestrates a full multi-table (shootout) tournament and its money.
 *
 *   entry  : each participant's fee is escrowed up front (PLAYER → PRIZE_POOL).
 *   play   : the MultiTableTournament structure runs round by round; each table
 *            is resolved to one winner (real socket play in production, or the
 *            bot runner / an injected resolver in tests).
 *   payout : ONE settlement at the end — the champion's prize is paid from the
 *            pool by occupancy (capacity = full 800-seat room) and the remainder
 *            is swept to the house. No money moves between rounds.
 */
@Injectable()
export class MultiTableTournamentService {
  constructor(
    private readonly tournament: TournamentService,
    @Optional() private readonly adminNotify?: AdminNotificationService,
  ) {}

  async run(params: {
    tournamentId: string;
    level: number;
    participants: MultiTableParticipant[];
    /** How a table decides its winner. Defaults to the bot runner. */
    resolveTable?: TableResolver;
    /** Lower the start threshold for tests/dev; defaults to the 80-player rule. */
    minPlayers?: number;
  }): Promise<MultiTableResult> {
    const { tournamentId, level, participants } = params;
    const resolveTable = params.resolveTable ?? ((players) => playTableWithBots(players).winnerId);

    // 1) Escrow every entry fee before play begins (idempotent per user).
    for (const p of participants) {
      await this.tournament.escrowEntry({
        tournamentId,
        userId: p.userId,
        level,
        subscription: p.subscription,
      });
    }

    // 2) Run the bracket to a single champion.
    const mtt = new MultiTableTournament(
      tournamentId,
      participants.map((p) => p.userId),
      { minPlayers: params.minPlayers },
    );
    while (!mtt.isComplete) {
      const winners: Record<string, string> = {};
      for (const table of mtt.tables) {
        winners[table.id] = resolveTable(table.players);
      }
      mtt.advance(winners);
    }
    const championId = mtt.champion!;

    // 3) Settle the prize once, occupancy measured against the full room.
    const champion = participants.find((p) => p.userId === championId)!;
    const payout = await this.tournament.settle({
      tournamentId,
      level,
      winnerId: championId,
      winnerSubscription: champion.subscription,
      participants,
      capacity: MAX_PLAYERS,
    });

    // Alert the admin of the awarded prize (tournament + amount). Non-fatal.
    await this.adminNotify?.prizeAwarded({
      tournamentId,
      level,
      winnerId: championId,
      prizeCents: payout.winnerCents,
    });

    return { championId, rounds: mtt.round, payout };
  }
}
