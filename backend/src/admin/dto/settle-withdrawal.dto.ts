import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SettleWithdrawalDto {
  @IsOptional()
  @IsString()
  @MaxLength(280)
  adminNote?: string;
}
