import { IsBoolean, IsInt, IsOptional, IsString, Length, Max, Min, ValidateIf } from 'class-validator';

export class CreateAgentDto {
  @IsString()
  @Length(2, 60)
  name!: string;

  // Blank = suggested from the name (e.g. "JOAO47").
  @IsOptional()
  @IsString()
  @Length(0, 40)
  code?: string;

  @IsOptional()
  @IsString()
  @Length(0, 30)
  phone?: string;

  // Percent of first subscription + first deposit; null/omitted = not agreed yet.
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  @Max(100)
  commissionPct?: number | null;
}

export class UpdateAgentDto {
  @IsOptional()
  @IsString()
  @Length(2, 60)
  name?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @Length(0, 30)
  phone?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  @Max(100)
  commissionPct?: number | null;

  // false = the code stops working at sign-up; players already linked stay.
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class LinkAgentDto {
  // The agent's code; null or "" unlinks the player.
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @Length(0, 40)
  code?: string | null;
}
