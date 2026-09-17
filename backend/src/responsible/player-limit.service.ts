import { BadRequestException, Injectable } from '@nestjs/common';
import { PlayerLimit } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Responsible gaming: limits a player sets on THEMSELVES.
 *
 *   deposit ceilings — max total deposited per rolling day / week / month
 *   self-exclusion   — a break from depositing and from money games
 *
 * Direction matters. Lowering a ceiling, or excluding yourself, applies at once.
 * RAISING a ceiling waits out a cooling-off period (COOLING_OFF_HOURS) so the
 * protection cannot be undone on impulse; the new values sit in pending* until
 * pendingEffectiveAt and are promoted the next time the limits are read.
 *
 * Only CONFIRMED money counts against a ceiling: a confirmed manual Pix deposit
 * or a PAID gateway order. Pending ones do not — nothing has arrived yet.
 *
 * Admin blocks (User.status) are a different thing and are enforced elsewhere.
 */

export const COOLING_OFF_HOURS = 24;

/** Indefinite self-exclusion is stored as a date far in the future. */
export const INDEFINITE_EXCLUSION_YEARS = 100;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export type LimitWindow = 'daily' | 'weekly' | 'monthly';

export const WINDOW_MS: Record<LimitWindow, number> = {
  daily: DAY_MS,
  weekly: 7 * DAY_MS,
  monthly: 30 * DAY_MS,
};

export interface LimitValues {
  dailyCents: bigint | null;
  weeklyCents: bigint | null;
  monthlyCents: bigint | null;
}

export interface LimitView extends LimitValues {
  /** Higher ceilings waiting out the cooling-off period, if any. */
  pending: (LimitValues & { effectiveAt: Date }) | null;
  selfExcludedUntil: Date | null;
  selfExcluded: boolean;
  /** How much has already been deposited in each window (cents). */
  used: Record<LimitWindow, bigint>;
}

@Injectable()
export class PlayerLimitService {
  constructor(private readonly prisma: PrismaService) {}

  /** The player's limits, with any due raise promoted first. */
  async get(userId: string): Promise<LimitView> {
    const row = await this.promoteIfDue(userId);
    const used = await this.usedByWindow(userId);
    return {
      dailyCents: row?.dailyCents ?? null,
      weeklyCents: row?.weeklyCents ?? null,
      monthlyCents: row?.monthlyCents ?? null,
      pending:
        row?.pendingEffectiveAt != null
          ? {
              dailyCents: row.pendingDailyCents,
              weeklyCents: row.pendingWeeklyCents,
              monthlyCents: row.pendingMonthlyCents,
              effectiveAt: row.pendingEffectiveAt,
            }
          : null,
      selfExcludedUntil: row?.selfExcludedUntil ?? null,
      selfExcluded: isSelfExcluded(row),
      used,
    };
  }

  /**
   * Set the player's ceilings. Null means "no limit" for that window, which is
   * always a raise. Lower values apply now; higher ones after the cooling-off.
   */
  async set(userId: string, next: Partial<LimitValues>): Promise<LimitView> {
    for (const [key, value] of Object.entries(next)) {
      if (value != null && (value as bigint) <= 0n) {
        throw new BadRequestException(`O limite ${key} deve ser maior que zero.`);
      }
    }
    const current = await this.promoteIfDue(userId);

    // `null` means "no limit", so presence is checked with `in` — never `??`,
    // which would read an explicit null as "not provided".
    const WINDOWS = ['dailyCents', 'weeklyCents', 'monthlyCents'] as const;
    const immediate = new Map<(typeof WINDOWS)[number], bigint | null>();
    const delayed = new Map<(typeof WINDOWS)[number], bigint | null>();
    for (const window of WINDOWS) {
      if (!(window in next)) continue;
      const wanted = next[window] ?? null;
      if (isRaise(current?.[window] ?? null, wanted)) delayed.set(window, wanted);
      else immediate.set(window, wanted);
    }

    const pendingExists = current?.pendingEffectiveAt != null;
    const data: Record<string, bigint | null | Date> = {};
    for (const [window, value] of immediate) data[window] = value;

    if (delayed.size > 0 || pendingExists) {
      // What the limits will be once the cooling-off passes: start from the
      // pending snapshot (or today's values), then apply this change. A
      // tightening made now must also land in the snapshot, otherwise the
      // pending raise would quietly undo it.
      const snapshot = new Map<(typeof WINDOWS)[number], bigint | null>(
        WINDOWS.map((w) => [
          w,
          pendingExists
            ? (current![`pending${capitalize(w)}` as 'pendingDailyCents'] ?? null)
            : (current?.[w] ?? null),
        ]),
      );
      for (const [window, value] of immediate) snapshot.set(window, value);
      for (const [window, value] of delayed) snapshot.set(window, value);

      const stillRaises = WINDOWS.some((w) => {
        const after = snapshot.get(w) ?? null;
        const nowValue = w in data ? (data[w] as bigint | null) : (current?.[w] ?? null);
        return isRaise(nowValue, after);
      });

      if (stillRaises) {
        data.pendingDailyCents = snapshot.get('dailyCents') ?? null;
        data.pendingWeeklyCents = snapshot.get('weeklyCents') ?? null;
        data.pendingMonthlyCents = snapshot.get('monthlyCents') ?? null;
        // A fresh raise restarts the wait; a tightening leaves it running.
        data.pendingEffectiveAt =
          delayed.size > 0 ? new Date(Date.now() + COOLING_OFF_HOURS * HOUR_MS) : current!.pendingEffectiveAt!;
      } else {
        // Nothing left to loosen — drop the pending change entirely.
        data.pendingDailyCents = null;
        data.pendingWeeklyCents = null;
        data.pendingMonthlyCents = null;
        data.pendingEffectiveAt = null;
      }
    }

    await this.prisma.playerLimit.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
    return this.get(userId);
  }

  /**
   * Take a break. [days] null means indefinite. Self-exclusion can always be
   * extended, never shortened — that is the whole point of it.
   */
  async selfExclude(userId: string, days: number | null): Promise<LimitView> {
    if (days != null && (!Number.isInteger(days) || days <= 0)) {
      throw new BadRequestException('O período deve ser um número de dias maior que zero.');
    }
    const until =
      days == null
        ? new Date(Date.now() + INDEFINITE_EXCLUSION_YEARS * 365 * DAY_MS)
        : new Date(Date.now() + days * DAY_MS);

    const current = await this.prisma.playerLimit.findUnique({ where: { userId } });
    if (current?.selfExcludedUntil && current.selfExcludedUntil.getTime() > until.getTime()) {
      throw new BadRequestException(
        'Você já está em autoexclusão por um período maior. Não é possível encurtá-lo.',
      );
    }

    await this.prisma.playerLimit.upsert({
      where: { userId },
      create: { userId, selfExcludedUntil: until },
      update: { selfExcludedUntil: until },
    });
    return this.get(userId);
  }

  /** True while the player is taking a break (blocks deposits and money games). */
  async isSelfExcluded(userId: string): Promise<boolean> {
    const row = await this.prisma.playerLimit.findUnique({ where: { userId } });
    return isSelfExcluded(row);
  }

  /**
   * Throw if [amountCents] would break a ceiling or land during a self-exclusion.
   * Called before any deposit is created, by both the gateway and manual paths.
   */
  async assertDepositAllowed(userId: string, amountCents: bigint): Promise<void> {
    const limits = await this.get(userId);
    if (limits.selfExcluded) {
      throw new BadRequestException(
        `Você está em autoexclusão até ${formatDate(limits.selfExcludedUntil!)}. Depósitos estão bloqueados.`,
      );
    }
    const ceilings: [LimitWindow, bigint | null, string][] = [
      ['daily', limits.dailyCents, 'diário'],
      ['weekly', limits.weeklyCents, 'semanal'],
      ['monthly', limits.monthlyCents, 'mensal'],
    ];
    for (const [window, ceiling, label] of ceilings) {
      if (ceiling == null) continue;
      const used = limits.used[window];
      if (used + amountCents > ceiling) {
        const left = ceiling - used;
        throw new BadRequestException(
          `Limite ${label} de ${brl(ceiling)} atingido. Disponível agora: ${brl(left > 0n ? left : 0n)}.`,
        );
      }
    }
  }

  /** Promote a pending raise once its cooling-off has passed. */
  private async promoteIfDue(userId: string): Promise<PlayerLimit | null> {
    const row = await this.prisma.playerLimit.findUnique({ where: { userId } });
    if (!row?.pendingEffectiveAt || row.pendingEffectiveAt.getTime() > Date.now()) return row;
    return this.prisma.playerLimit.update({
      where: { userId },
      data: {
        dailyCents: row.pendingDailyCents,
        weeklyCents: row.pendingWeeklyCents,
        monthlyCents: row.pendingMonthlyCents,
        pendingDailyCents: null,
        pendingWeeklyCents: null,
        pendingMonthlyCents: null,
        pendingEffectiveAt: null,
      },
    });
  }

  /** Money actually received in each rolling window (manual + gateway). */
  private async usedByWindow(userId: string): Promise<Record<LimitWindow, bigint>> {
    const now = Date.now();
    const out = {} as Record<LimitWindow, bigint>;
    for (const window of ['daily', 'weekly', 'monthly'] as const) {
      const since = new Date(now - WINDOW_MS[window]);
      const [manual, gateway] = await Promise.all([
        this.prisma.deposit.aggregate({
          _sum: { amountCents: true },
          where: { userId, status: 'CONFIRMED', settledAt: { gte: since } },
        }),
        this.prisma.paymentOrder.aggregate({
          _sum: { amountCents: true },
          where: { userId, status: 'PAID', purpose: 'DEPOSIT', paidAt: { gte: since } },
        }),
      ]);
      out[window] = (manual._sum.amountCents ?? 0n) + (gateway._sum.amountCents ?? 0n);
    }
    return out;
  }
}

/** A raise is anything that loosens the ceiling — including removing it. */
function isRaise(current: bigint | null, wanted: bigint | null): boolean {
  if (current == null) return false; // already unlimited: nothing to loosen
  if (wanted == null) return true; // unlimited is the biggest raise there is
  return wanted > current;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function isSelfExcluded(row: { selfExcludedUntil: Date | null } | null, now = new Date()): boolean {
  return !!row?.selfExcludedUntil && row.selfExcludedUntil.getTime() > now.getTime();
}

function brl(cents: bigint): string {
  return `R$ ${(Number(cents) / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('pt-BR');
}
