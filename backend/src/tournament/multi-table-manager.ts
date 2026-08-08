import { Injectable, Optional } from '@nestjs/common';
import { Subscription } from './subscription';
import { TournamentService, TournamentPayout } from './tournament.service';
import { MultiTableCoordinator } from './multi-table-coordinator';
import { MAX_PLAYERS } from './multi-table';
import { AdminNotificationService } from '../notifications/admin-notification.service';

/**
 * Plays one sub-table (of [level], with [players]) to its single winner and
 * resolves with the winner's id. Implemented by the socket gateway for live play
 * (real players + bots), or by a bot/instant runner in tests.
 */
export interface SubTableRunner {
  play(tableId: string, level: number, players: string[]): Promise<string>;
}

export interface StartResult {
  championId: string;
  payout: TournamentPayout;
}

/**
 * Live multi-table tournament lifecycle:
 *   register : escrow each entry and add the player to the forming roster;
 *   start    : run the bracket to a champion (each round's tables played
 *              concurrently by the injected runner) and settle ONE prize by
 *              occupancy (full 800-seat room). Fires the admin prize alert.
 *
 * The heavy logic (bracket, round advancement, per-table play, money) lives in
 * the tested pieces this composes; the gateway supplies only the SubTableRunner.
 */
@Injectable()
export class MultiTableTournamentManager {
  private readonly rosters = new Map<string, Map<string, Subscription>>();

  constructor(
    private readonly tournament: TournamentService,
    @Optional() private readonly adminNotify?: AdminNotificationService,
  ) {}

  /** Escrow a player's entry and add them to the forming tournament. Idempotent. */
  async register(
    tournamentId: string,
    level: number,
    userId: string,
    subscription: Subscription,
  ): Promise<number> {
    let roster = this.rosters.get(tournamentId);
    if (!roster) {
      roster = new Map<string, Subscription>();
      this.rosters.set(tournamentId, roster); // store before the await so concurrent calls share it
    }
    if (!roster.has(userId)) {
      roster.set(userId, subscription); // reserve the slot before the async escrow
      try {
        await this.tournament.escrowEntry({ tournamentId, userId, level, subscription });
      } catch (err) {
        roster.delete(userId); // escrow failed → release the slot
        throw err;
      }
    }
    return roster.size;
  }

  registered(tournamentId: string): number {
    return this.rosters.get(tournamentId)?.size ?? 0;
  }

  /** Run the tournament to a champion and settle the prize. */
  async start(
    tournamentId: string,
    level: number,
    runner: SubTableRunner,
    opts: { minPlayers?: number } = {},
  ): Promise<StartResult> {
    const roster = this.rosters.get(tournamentId);
    if (!roster || roster.size === 0) throw new Error(`No registrations for ${tournamentId}.`);
    const participants = [...roster.entries()].map(([userId, subscription]) => ({ userId, subscription }));

    const championId = await new Promise<string>((resolve, reject) => {
      const coord = new MultiTableCoordinator(
        tournamentId,
        participants.map((p) => p.userId),
        {
          onRoundReady: (tables) => {
            for (const t of tables) {
              runner
                .play(t.id, level, t.players)
                .then((winnerId) => coord.reportTableWinner(t.id, winnerId))
                .catch(reject);
            }
          },
          onChampion: (id) => resolve(id),
        },
        { minPlayers: opts.minPlayers },
      );
    });

    const champion = participants.find((p) => p.userId === championId)!;
    const payout = await this.tournament.settle({
      tournamentId,
      level,
      winnerId: championId,
      winnerSubscription: champion.subscription,
      participants,
      capacity: MAX_PLAYERS,
    });
    await this.adminNotify?.prizeAwarded({
      tournamentId,
      level,
      winnerId: championId,
      prizeCents: payout.winnerCents,
    });

    this.rosters.delete(tournamentId);
    return { championId, payout };
  }
}
