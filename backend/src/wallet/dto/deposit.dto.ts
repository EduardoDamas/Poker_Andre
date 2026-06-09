import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateDepositDto {
  // Amount in integer cents (e.g. 2000 = R$20,00).
  @IsInt()
  @Min(1)
  amountCents!: number;

  // Optional Pix proof / end-to-end id the player pasted.
  @IsOptional()
  @IsString()
  pixReference?: string;
}

export class SettleDepositDto {
  @IsOptional()
  @IsString()
  adminNote?: string;
}
