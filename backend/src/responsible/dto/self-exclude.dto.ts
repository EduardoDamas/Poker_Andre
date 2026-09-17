import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class SelfExcludeDto {
  /** Days of break. Omit for an indefinite self-exclusion. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  days?: number;
}
