import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

type Period = 'daily' | 'weekly' | 'monthly';

function periodStart(period: Period): Date {
  const now = new Date();
  if (period === 'daily') {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }
  const days = period === 'weekly' ? 7 : 30;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

/** Only the first name + initial — enough to brag, not enough to dox. */
function publicName(displayName: string): string {
  const parts = displayName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[1][0].toUpperCase()}.`;
}

/**
 * Leaderboards + the public winners feed. Both are computed from
 * TournamentWin rows written at settlement, so only REAL, paid-out wins
 * appear. Names are shortened for privacy.
 */
@Controller('rankings')
@UseGuards(JwtAuthGuard)
export class RankingsController {
  constructor(private readonly prisma: PrismaService) {}

  /** Top players by prize money for the period (daily / weekly / monthly). */
  @Get()
  async rankings(@Query('period') period?: string) {
    const p: Period = period === 'weekly' || period === 'monthly' ? period : 'daily';
    const grouped = await this.prisma.tournamentWin.groupBy({
      by: ['userId'],
      where: { createdAt: { gte: periodStart(p) } },
      _sum: { prizeCents: true },
      _count: { _all: true },
      orderBy: { _sum: { prizeCents: 'desc' } },
      take: 50,
    });
    const users = await this.prisma.user.findMany({
      where: { id: { in: grouped.map((g) => g.userId) } },
      select: { id: true, displayName: true },
    });
    const names = new Map(users.map((u) => [u.id, publicName(u.displayName)]));
    return {
      period: p,
      entries: grouped.map((g, i) => ({
        position: i + 1,
        name: names.get(g.userId) ?? 'Jogador',
        prizeCents: (g._sum.prizeCents ?? 0n).toString(),
        wins: g._count._all,
      })),
    };
  }

  /** Latest paid-out wins: who won, how much, and at what level. */
  @Get('winners')
  async winners() {
    const wins = await this.prisma.tournamentWin.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { user: { select: { displayName: true } } },
    });
    return wins.map((w) => ({
      name: publicName(w.user.displayName),
      level: w.level,
      prizeCents: w.prizeCents.toString(),
      createdAt: w.createdAt.toISOString(),
    }));
  }
}
