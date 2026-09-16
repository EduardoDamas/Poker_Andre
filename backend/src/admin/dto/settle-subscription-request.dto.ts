import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SettleSubscriptionRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  adminNote?: string;
}
