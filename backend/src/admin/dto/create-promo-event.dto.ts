import { IsDateString, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class CreatePromoEventDto {
  @IsString()
  @Length(2, 60)
  name!: string;

  /** When the tournament may start (ISO 8601). The room opens 30 minutes before. */
  @IsDateString()
  startsAt!: string;

  /** Prize for a winner who is not a subscriber, in cents (R$250 = 25000). */
  @IsInt()
  @Min(1)
  @Max(10_000_000)
  prizeCents!: number;

  /** Prize for a winner who was a subscriber when it started, in cents. */
  @IsInt()
  @Min(1)
  @Max(10_000_000)
  prizeSubscriberCents!: number;

  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(80)
  minPlayers?: number;
}
