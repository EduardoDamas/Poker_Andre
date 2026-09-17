import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { RoomRegistration } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TournamentService } from './tournament.service';
import { Subscription } from './subscription';
import { multiplierFor } from '../poker/prize-table';

/**
 * Scheduled tournament rooms — the format the client specified on 2026-09-17.
 *
 *   A room per level opens every WINDOW minutes, on the clock (:00, :10, :20…).
 *   Players register for the NEXT window and pay their entry then; nobody joins
 *   a tournament already under way — they wait for the following window.
 *   At the tick: enough players → the bracket runs; too few → every entry is
 *   given back and the room rolls to the next window.
 *
 * A room is 10 tables of 8 = 80 seats, so 80 registrations is 100% occupancy on
 * the prize table, and the pool is capped at PRIZE_POOL_SHARE_PCT of what came
 * in (50% for now; raised once the subscriber base grows).
 *
 * Registrations live in the database, not in memory: the entry is real money
 * held in escrow, and a restart must not strand it.
 */

/** 10 tables × 8 seats. Full room = 100% occupancy on the prize table. */
export const ROOM_SEATS = 80;

/**
 * Fewest players in a full-size room whose occupancy still earns a prize
 * multiplier — derived from the prize table rather than hardcoded, so it
 * follows the table if the tiers ever change.
 */
export function minPlayersThatWinSomething(seats: number = ROOM_SEATS): number {
  for (let n = 1; n <= seats; n++) {
    if (multiplierFor(n / seats) > 0) return n;
  }
  return seats;
}

/** Levels that open a room every window. */
export const ROOM_LEVELS = [1, 2, 3, 4, 5, 6, 7];

export interface LevelSchedule {
  level: number;
  roomId: string;
  startsAt: Date;
  registered: number;
  minPlayers: number;
  seats: number;
  /** True when this player already holds a seat in the coming window. */
  registered_me?: boolean;
}

export interface WindowOutcome {
  roomId: string;
  level: number;
  /** Players to seat when the tournament runs; empty when it was refunded. */
  players: { userId: string; subscription: Subscription }[];
  started: boolean;
  refunded: number;
}

@Injectable()
export class ScheduledRoomsService {
  private readonly logger = new Logger('ScheduledRooms');

  constructor(
    private readonly prisma: PrismaService,
    private readonly tournament: TournamentService,
  ) {}

  /** Window length in minutes (client: 10). */
  get windowMinutes(): number {
    const raw = Number(process.env.TOURNAMENT_WINDOW_MINUTES);
    return Number.isInteger(raw) && raw > 0 ? raw : 10;
  }

  /**
   * How many players a window needs to run. The client's target is 40 (5 full
   * tables); ROOM_MIN_PLAYERS lowers it while the base grows, with no deploy.
   *
   * Never goes below the point where the prize table actually pays: under 10%
   * occupancy the multiplier is 0, so a room would be played for a prize of
   * nothing and every cent would stay with the house. A tournament nobody can
   * win is worse than no tournament — those windows refund instead.
   */
  get minPlayers(): number {
    const raw = Number(process.env.ROOM_MIN_PLAYERS);
    const wanted = Number.isInteger(raw) && raw >= 2 && raw <= ROOM_SEATS ? raw : 8;
    return Math.max(wanted, minPlayersThatWinSomething());
  }

  /** Share of the money collected that may be paid out (client: 50%). */
  get prizePoolSharePct(): number {
    const raw = Number(process.env.PRIZE_POOL_SHARE_PCT);
    if (Number.isInteger(raw) && raw > 0 && raw <= 100) return raw;
    return 50;
  }

  // ---- window maths (pure) ----

  /** Start of the window containing [at], aligned to the clock. */
  windowStart(at: Date = new Date()): Date {
    const ms = this.windowMinutes * 60_000;
    return new Date(Math.floor(at.getTime() / ms) * ms);
  }

  /** Start of the window players can still register for. */
  nextWindowStart(at: Date = new Date()): Date {
    return new Date(this.windowStart(at).getTime() + this.windowMinutes * 60_000);
  }

  /** One tournament instance per (level, window) — fresh ledger references. */
  roomId(level: number, windowStart: Date): string {
    return `sala-l${level}-${windowStart.getTime()}`;
  }

  // ---- registration ----

  /**
   * Take a seat in the coming window and pay the entry. Idempotent: registering
   * twice for the same window returns the existing seat instead of charging again.
   */
  async register(userId: string, level: number, subscription: Subscription): Promise<LevelSchedule> {
    if (!ROOM_LEVELS.includes(level)) {
      throw new BadRequestException(`Nível inválido: ${level}.`);
    }
    const startsAt = this.nextWindowStart();
    const roomId = this.roomId(level, startsAt);

    const existing = await this.prisma.roomRegistration.findUnique({
      where: { roomId_userId: { roomId, userId } },
    });
    if (existing?.status === 'REGISTERED') return this.levelSchedule(level, userId);

    // Escrow first: if the wallet is short this throws and no seat is recorded.
    await this.tournament.escrowEntry({ tournamentId: roomId, userId, level, subscription });
    await this.prisma.roomRegistration.upsert({
      where: { roomId_userId: { roomId, userId } },
      create: { roomId, userId, level, subscription, windowStart: startsAt, status: 'REGISTERED' },
      update: { status: 'REGISTERED', subscription, settledAt: null },
    });
    return this.levelSchedule(level, userId);
  }

  /** Pull out before the start and get the entry back. */
  async cancel(userId: string, level: number): Promise<LevelSchedule> {
    const startsAt = this.nextWindowStart();
    const roomId = this.roomId(level, startsAt);
    const seat = await this.prisma.roomRegistration.findUnique({
      where: { roomId_userId: { roomId, userId } },
    });
    if (!seat || seat.status !== 'REGISTERED') {
      throw new BadRequestException('Você não está inscrito na próxima sala.');
    }
    await this.tournament.refundEntry(roomId, userId);
    await this.prisma.roomRegistration.update({
      where: { id: seat.id },
      data: { status: 'CANCELLED', settledAt: new Date() },
    });
    return this.levelSchedule(level, userId);
  }

  /** What the app shows: next start, how many are in, and the minimum. */
  async schedule(userId?: string): Promise<LevelSchedule[]> {
    return Promise.all(ROOM_LEVELS.map((level) => this.levelSchedule(level, userId)));
  }

  private async levelSchedule(level: number, userId?: string): Promise<LevelSchedule> {
    const startsAt = this.nextWindowStart();
    const roomId = this.roomId(level, startsAt);
    const [registered, mine] = await Promise.all([
      this.prisma.roomRegistration.count({ where: { roomId, status: 'REGISTERED' } }),
      userId
        ? this.prisma.roomRegistration.findUnique({ where: { roomId_userId: { roomId, userId } } })
        : Promise.resolve(null),
    ]);
    return {
      level,
      roomId,
      startsAt,
      registered,
      minPlayers: this.minPlayers,
      seats: ROOM_SEATS,
      ...(userId ? { registered_me: mine?.status === 'REGISTERED' } : {}),
    };
  }

  // ---- the tick ----

  /**
   * Close the window that has just ended: for each level, either hand the
   * roster over to be played, or give every entry back.
   *
   * Safe to call more than once for the same window — rosters are claimed by
   * flipping REGISTERED to STARTED, and refunds are idempotent.
   */
  async closeWindow(windowStart: Date): Promise<WindowOutcome[]> {
    const out: WindowOutcome[] = [];
    for (const level of ROOM_LEVELS) {
      const roomId = this.roomId(level, windowStart);
      const seats = await this.prisma.roomRegistration.findMany({
        where: { roomId, status: 'REGISTERED' },
        orderBy: { createdAt: 'asc' },
      });
      if (seats.length === 0) continue;

      if (seats.length >= this.minPlayers) {
        await this.claim(seats, 'STARTED');
        this.logger.log(`${roomId}: ${seats.length} players — tournament starts`);
        out.push({
          roomId,
          level,
          players: seats.map((s) => ({ userId: s.userId, subscription: s.subscription })),
          started: true,
          refunded: 0,
        });
      } else {
        const { refunded } = await this.tournament.refundEntries(
          roomId,
          seats.map((s) => s.userId),
        );
        await this.claim(seats, 'REFUNDED');
        this.logger.log(
          `${roomId}: only ${seats.length} of ${this.minPlayers} — ${refunded} entries returned`,
        );
        out.push({ roomId, level, players: [], started: false, refunded });
      }
    }
    return out;
  }

  private async claim(seats: RoomRegistration[], status: 'STARTED' | 'REFUNDED'): Promise<void> {
    await this.prisma.roomRegistration.updateMany({
      where: { id: { in: seats.map((s) => s.id) }, status: 'REGISTERED' },
      data: { status, settledAt: new Date() },
    });
  }

  /** Settle a finished room: pays the champion per the room's own rules. */
  async settleRoom(params: {
    roomId: string;
    level: number;
    winnerId: string;
    players: { userId: string; subscription: Subscription }[];
  }) {
    const winner = params.players.find((p) => p.userId === params.winnerId);
    return this.tournament.settle({
      tournamentId: params.roomId,
      level: params.level,
      winnerId: params.winnerId,
      winnerSubscription: winner?.subscription ?? 'NONE',
      participants: params.players,
      capacity: ROOM_SEATS,
      prizePoolSharePct: this.prizePoolSharePct,
    });
  }
}
