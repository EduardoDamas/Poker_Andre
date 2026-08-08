import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, Max, Min } from 'class-validator';

/**
 * Query for GET /payments/tournament-entry. Query params arrive as strings, so
 * `level` and `subscriber` are coerced before validation.
 */
export class EntryLinkQueryDto {
  @Transform(({ value }) => Number.parseInt(value as string, 10))
  @IsInt()
  @Min(1)
  @Max(7)
  level!: number;

  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  subscriber!: boolean;

  @IsIn(['pix', 'card'])
  method!: 'pix' | 'card';
}
