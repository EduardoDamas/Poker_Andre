import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Prisma, PointsTxnKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** 1 paid point = 1000 free points (both conversion directions). */
export const PAID_TO_FREE_RATE = 1000n;

/** Free points for winning a solo (vs bots) hand + the daily earning cap. */
export const SOLO_WIN_FREE_POINTS = 100n;
export const SOLO_DAILY_FREE_CAP = 2000n;

/** Generous reward for sharing a tournament win on social media (per win). */
export const SHARE_WIN_FREE_POINTS = 5000n;

/**
 * The daily wheel, server-authoritative. `weight` is the draw probability in
 * tenths of a percent (sums to 1000). The mobile app renders these segments in
 * this exact order and animates to the index the server returns.
 */
export interface WheelSegment {
  label: string;
  freePoints: number;
  paidPoints: number;
  weight: number;
}

export const WHEEL_SEGMENTS: WheelSegment[] = [
  { label: 'Nada', freePoints: 0, paidPoints: 0, weight: 180 },
  { label: '100', freePoints: 100, paidPoints: 0, weight: 250 },
  { label: '200', freePoints: 200, paidPoints: 0, weight: 200 },
  { label: '500', freePoints: 500, paidPoints: 0, weight: 150 },
  { label: '1.000', freePoints: 1000, paidPoints: 0, weight: 100 },
  { label: '2.000', freePoints: 2000, paidPoints: 0, weight: 60 },
  { label: '10.000', freePoints: 10000, paidPoints: 0, weight: 20 },
  { label: '5 P', freePoints: 0, paidPoints: 5, weight: 22 },
  { label: '10 P', freePoints: 0, paidPoints: 10, weight: 10 },
  { label: '20 P', freePoints: 0, paidPoints: 20, weight: 5 },
  { label: '50 P', freePoints: 0, paidPoints: 50, weight: 3 },
];

/** Consecutive-day (daily spin) milestones, each granted once per user. */
export const STREAK_MILESTONES = [
  { days: 30, freePoints: 50_000, paidPoints: 0 },
  { days: 90, freePoints: 100_000, paidPoints: 0 },
  { days: 180, freePoints: 0, paidPoints: 500 },
];

export interface SpinResult {
  segmentIndex: number;
  freePoints: number;
  paidPoints: number;
  streakDays: number;
  milestone?: { days: number; freePoints: number; paidPoints: number };
  balances: { freePoints: string; paidPoints: string };
}

function utcDay(d = new Date()): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function previousUtcDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return utcDay(d);
}

/**
 * Virtual points economy: free/paid balances, 1:1000 conversion, the daily
 * lucky wheel with streaks and milestones, and solo-game rewards. Completely
 * separate from the BRL wallet ledger — no real money moves here. Every
 * change writes a PointsTransaction; the daily spin and each milestone carry
 * a unique referenceId so they can never be granted twice (race-safe).
 */
@Injectable()
export class PointsService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureAccount(userId: string) {
    return this.prisma.pointsAccount.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });
  }

  /** Full status for the profile / points screen. */
  async status(userId: string) {
    const acc = await this.ensureAccount(userId);
    const today = utcDay();
    const [todaySpin, totals, history] = await Promise.all([
      this.prisma.pointsTransaction.findUnique({
        where: { referenceId: `points-spin-${userId}-${today}` },
      }),
      this.prisma.pointsTransaction.aggregate({
        where: { userId, freeDelta: { gt: 0 } },
        _sum: { freeDelta: true },
      }),
      this.prisma.pointsTransaction.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);

    // Streak shown as 0 when broken (yesterday unmet and today unspun).
    const liveStreak =
      acc.lastSpinDay === today || acc.lastSpinDay === previousUtcDay(today)
        ? acc.streakDays
        : 0;
    const next = STREAK_MILESTONES.find((m) => m.days > liveStreak) ?? null;

    return {
      freePoints: acc.freePoints.toString(),
      paidPoints: acc.paidPoints.toString(),
      conversionRate: Number(PAID_TO_FREE_RATE),
      streakDays: liveStreak,
      canSpinToday: acc.lastSpinDay !== today,
      todaySpin: todaySpin
        ? { freePoints: Number(todaySpin.freeDelta), paidPoints: Number(todaySpin.paidDelta) }
        : null,
      totalFreeEarned: (totals._sum.freeDelta ?? 0n).toString(),
      nextMilestone: next,
      milestones: STREAK_MILESTONES,
      wheel: WHEEL_SEGMENTS.map(({ label, freePoints, paidPoints }) => ({
        label,
        freePoints,
        paidPoints,
      })),
      history: history.map((h) => ({
        kind: h.kind,
        freeDelta: h.freeDelta.toString(),
        paidDelta: h.paidDelta.toString(),
        memo: h.memo,
        createdAt: h.createdAt.toISOString(),
      })),
    };
  }

  /**
   * Convert between the two balances at 1 paid = 1000 free.
   * `direction`: 'PAID_TO_FREE' (amount = paid points) or 'FREE_TO_PAID'
   * (amount = free points, must be a multiple of 1000).
   */
  async convert(userId: string, direction: 'PAID_TO_FREE' | 'FREE_TO_PAID', amount: number) {
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new BadRequestException('Quantidade inválida.');
    }
    const amt = BigInt(amount);
    if (direction === 'FREE_TO_PAID' && amt % PAID_TO_FREE_RATE !== 0n) {
      throw new BadRequestException(
        `A conversão de pontos grátis deve ser em múltiplos de ${PAID_TO_FREE_RATE}.`,
      );
    }

    await this.ensureAccount(userId);
    const [freeDelta, paidDelta] =
      direction === 'PAID_TO_FREE'
        ? [amt * PAID_TO_FREE_RATE, -amt]
        : [-amt, amt / PAID_TO_FREE_RATE];

    const acc = await this.prisma.$transaction(async (tx) => {
      const cur = await tx.pointsAccount.findUnique({ where: { userId } });
      if (!cur) throw new BadRequestException('Conta de pontos indisponível.');
      if (cur.freePoints + freeDelta < 0n || cur.paidPoints + paidDelta < 0n) {
        throw new BadRequestException('Saldo de pontos insuficiente.');
      }
      const updated = await tx.pointsAccount.update({
        where: { userId },
        data: {
          freePoints: cur.freePoints + freeDelta,
          paidPoints: cur.paidPoints + paidDelta,
        },
      });
      await tx.pointsTransaction.create({
        data: {
          userId,
          kind: PointsTxnKind.CONVERSION,
          freeDelta,
          paidDelta,
          memo:
            direction === 'PAID_TO_FREE'
              ? `Conversão: ${amount} pagos → ${freeDelta} grátis`
              : `Conversão: ${amount} grátis → ${paidDelta} pagos`,
        },
      });
      return updated;
    });

    return { freePoints: acc.freePoints.toString(), paidPoints: acc.paidPoints.toString() };
  }

  /**
   * The daily wheel spin — also the daily check-in that feeds the streak.
   * One spin per UTC day (unique referenceId makes doubles impossible). The
   * outcome is drawn server-side; the client only animates to the returned
   * segment. Milestones (30/90/180 consecutive days) are granted here, each
   * at most once per user, and recorded like every other change.
   */
  async spin(userId: string): Promise<SpinResult> {
    const acc = await this.ensureAccount(userId);
    const today = utcDay();
    if (acc.lastSpinDay === today) {
      throw new ConflictException('Você já girou a roleta hoje. Volte amanhã!');
    }
    const streak = acc.lastSpinDay === previousUtcDay(today) ? acc.streakDays + 1 : 1;

    // Weighted draw.
    const total = WHEEL_SEGMENTS.reduce((s, seg) => s + seg.weight, 0);
    let roll = Math.floor(Math.random() * total);
    let segmentIndex = 0;
    for (let i = 0; i < WHEEL_SEGMENTS.length; i++) {
      roll -= WHEEL_SEGMENTS[i].weight;
      if (roll < 0) {
        segmentIndex = i;
        break;
      }
    }
    const seg = WHEEL_SEGMENTS[segmentIndex];

    const milestone = STREAK_MILESTONES.find((m) => m.days === streak);

    try {
      const balances = await this.prisma.$transaction(async (tx) => {
        // The unique referenceId is the true once-per-day guard.
        await tx.pointsTransaction.create({
          data: {
            userId,
            kind: PointsTxnKind.WHEEL,
            freeDelta: BigInt(seg.freePoints),
            paidDelta: BigInt(seg.paidPoints),
            referenceId: `points-spin-${userId}-${today}`,
            memo: `Roleta diária: ${seg.label}`,
          },
        });
        let free = acc.freePoints + BigInt(seg.freePoints);
        let paid = acc.paidPoints + BigInt(seg.paidPoints);

        if (milestone) {
          // Granted once ever — the unique referenceId rejects a second grant
          // (e.g. a streak rebuilt after a reset).
          try {
            await tx.pointsTransaction.create({
              data: {
                userId,
                kind: PointsTxnKind.MILESTONE,
                freeDelta: BigInt(milestone.freePoints),
                paidDelta: BigInt(milestone.paidPoints),
                referenceId: `points-milestone-${userId}-${milestone.days}`,
                memo: `Sequência de ${milestone.days} dias`,
              },
            });
            free += BigInt(milestone.freePoints);
            paid += BigInt(milestone.paidPoints);
          } catch (err) {
            if (
              !(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')
            ) {
              throw err;
            }
          }
        }

        const updated = await tx.pointsAccount.update({
          where: { userId },
          data: { freePoints: free, paidPoints: paid, streakDays: streak, lastSpinDay: today },
        });
        return updated;
      });

      return {
        segmentIndex,
        freePoints: seg.freePoints,
        paidPoints: seg.paidPoints,
        streakDays: streak,
        milestone,
        balances: {
          freePoints: balances.freePoints.toString(),
          paidPoints: balances.paidPoints.toString(),
        },
      };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Você já girou a roleta hoje. Volte amanhã!');
      }
      throw err;
    }
  }

  /**
   * Reward for sharing a tournament win on social media. Gated on a REAL,
   * settled win (TournamentWin row) and granted at most once per win — the
   * unique referenceId makes a double-claim impossible.
   */
  async shareWin(userId: string) {
    const win = await this.prisma.tournamentWin.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    if (!win) {
      throw new BadRequestException('Você ainda não tem vitórias para compartilhar.');
    }
    try {
      await this.prisma.$transaction([
        this.prisma.pointsTransaction.create({
          data: {
            userId,
            kind: PointsTxnKind.SHARE,
            freeDelta: SHARE_WIN_FREE_POINTS,
            referenceId: `points-share-${win.id}`,
            memo: `Divulgação da vitória (Nível ${win.level})`,
          },
        }),
        this.prisma.pointsAccount.upsert({
          where: { userId },
          update: { freePoints: { increment: SHARE_WIN_FREE_POINTS } },
          create: { userId, freePoints: SHARE_WIN_FREE_POINTS },
        }),
      ]);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new BadRequestException('Você já recebeu os pontos desta vitória.');
      }
      throw err;
    }
    return { awarded: Number(SHARE_WIN_FREE_POINTS) };
  }

  /**
   * Reward for winning a solo hand vs bots, reported by the app. Client-claimed
   * (the solo engine runs on-device), so it is bounded by a small per-win value
   * and a hard daily cap per user.
   */
  async soloWin(userId: string) {
    await this.ensureAccount(userId);
    const dayStart = new Date(`${utcDay()}T00:00:00Z`);
    const earned = await this.prisma.pointsTransaction.aggregate({
      where: { userId, kind: PointsTxnKind.GAME_REWARD, createdAt: { gte: dayStart } },
      _sum: { freeDelta: true },
    });
    const already = earned._sum.freeDelta ?? 0n;
    if (already >= SOLO_DAILY_FREE_CAP) {
      return { awarded: 0, cappedToday: true };
    }
    const award =
      already + SOLO_WIN_FREE_POINTS > SOLO_DAILY_FREE_CAP
        ? SOLO_DAILY_FREE_CAP - already
        : SOLO_WIN_FREE_POINTS;

    await this.prisma.$transaction([
      this.prisma.pointsTransaction.create({
        data: {
          userId,
          kind: PointsTxnKind.GAME_REWARD,
          freeDelta: award,
          memo: 'Vitória contra os robôs',
        },
      }),
      this.prisma.pointsAccount.update({
        where: { userId },
        data: { freePoints: { increment: award } },
      }),
    ]);
    return { awarded: Number(award), cappedToday: false };
  }
}
