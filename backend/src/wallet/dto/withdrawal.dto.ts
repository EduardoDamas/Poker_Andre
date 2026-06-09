import { IsInt, IsString, Min, MinLength } from 'class-validator';

export class CreateWithdrawalDto {
  @IsInt()
  @Min(1)
  amountCents!: number;

  // Player's Pix key (CPF / email / phone / random).
  @IsString()
  @MinLength(1)
  pixKey!: string;
}
