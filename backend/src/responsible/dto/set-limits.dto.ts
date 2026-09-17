import { IsInt, IsOptional, Max, Min, ValidateIf } from 'class-validator';

// A limit is an integer in cents, or null to remove it. R$1.000.000 is a sane
// upper bound for a self-imposed ceiling — above that it means "no limit".
const MAX_LIMIT_CENTS = 1_000_000_00;

export class SetLimitsDto {
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(1)
  @Max(MAX_LIMIT_CENTS)
  dailyCents?: number | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(1)
  @Max(MAX_LIMIT_CENTS)
  weeklyCents?: number | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(1)
  @Max(MAX_LIMIT_CENTS)
  monthlyCents?: number | null;
}
