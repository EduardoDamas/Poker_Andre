import { Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, JwtPayload } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { PlayerLimitService, LimitView } from './player-limit.service';
import { SetLimitsDto } from './dto/set-limits.dto';
import { SelfExcludeDto } from './dto/self-exclude.dto';

/** BigInt-free view for JSON. */
function serialize(v: LimitView) {
  const cents = (c: bigint | null) => (c == null ? null : c.toString());
  return {
    dailyCents: cents(v.dailyCents),
    weeklyCents: cents(v.weeklyCents),
    monthlyCents: cents(v.monthlyCents),
    pending: v.pending && {
      dailyCents: cents(v.pending.dailyCents),
      weeklyCents: cents(v.pending.weeklyCents),
      monthlyCents: cents(v.pending.monthlyCents),
      effectiveAt: v.pending.effectiveAt,
    },
    selfExcludedUntil: v.selfExcludedUntil,
    selfExcluded: v.selfExcluded,
    used: {
      daily: v.used.daily.toString(),
      weekly: v.used.weekly.toString(),
      monthly: v.used.monthly.toString(),
    },
  };
}

// Responsible gaming — the limits a player sets on themselves.
@Controller('limits')
@UseGuards(JwtAuthGuard)
export class PlayerLimitController {
  constructor(private readonly limits: PlayerLimitService) {}

  /** GET /limits — current ceilings, any pending raise, and usage so far. */
  @Get()
  async mine(@CurrentUser() user: JwtPayload) {
    return serialize(await this.limits.get(user.sub));
  }

  /**
   * PUT /limits { dailyCents?, weeklyCents?, monthlyCents? } — null clears a
   * limit. Lower values apply now; higher ones after the cooling-off period.
   */
  @Put()
  async set(@CurrentUser() user: JwtPayload, @Body() dto: SetLimitsDto) {
    const toCents = (v: number | null | undefined) =>
      v === undefined ? undefined : v === null ? null : BigInt(v);
    const next = {
      ...('dailyCents' in dto ? { dailyCents: toCents(dto.dailyCents) } : {}),
      ...('weeklyCents' in dto ? { weeklyCents: toCents(dto.weeklyCents) } : {}),
      ...('monthlyCents' in dto ? { monthlyCents: toCents(dto.monthlyCents) } : {}),
    };
    return serialize(await this.limits.set(user.sub, next));
  }

  /** POST /limits/self-exclusion { days } — omit days for an indefinite break. */
  @Post('self-exclusion')
  async selfExclude(@CurrentUser() user: JwtPayload, @Body() dto: SelfExcludeDto) {
    return serialize(await this.limits.selfExclude(user.sub, dto.days ?? null));
  }
}
