import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class BlockUserDto {
  @IsString()
  @MaxLength(280)
  reason!: string;

  /** Temporary block expiry (epoch ms, future). Omit for a permanent block. */
  @IsOptional()
  @IsInt()
  @Min(0)
  untilMs?: number;
}
