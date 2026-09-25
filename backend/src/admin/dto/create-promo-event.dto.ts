import { IsDateString, IsInt, IsOptional, IsString, Length, Max, Min, ValidateIf } from 'class-validator';

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

  /** Players needed to start at startsAt (client: 80 = 10 full tables). */
  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(100)
  minPlayers?: number;

  /** Places on offer (default 100: 10 tables of up to 10 → a final table of 10). */
  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(100)
  maxPlayers?: number;

  /**
   * Minutes past startsAt after which it starts with whoever is present (2+),
   * even below minPlayers. Default 30; null waits for minPlayers until the room
   * closes, 3 hours after the start.
   */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  @Max(150)
  waitMinutes?: number | null;

  /** Rehearsal: robots that join at the start. Nothing is paid. 0 or absent = a real event. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(99)
  robots?: number;
}
