import { IsIn, IsInt, IsOptional, Min } from 'class-validator';
import { Subscription } from '@prisma/client';

const TIERS: Subscription[] = ['NONE', 'MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL'];

export class GrantSubscriptionDto {
  @IsIn(TIERS)
  subscription!: Subscription;

  // Optional expiry (epoch ms). Omit for NONE / no expiry.
  @IsOptional()
  @IsInt()
  @Min(0)
  untilMs?: number;
}
