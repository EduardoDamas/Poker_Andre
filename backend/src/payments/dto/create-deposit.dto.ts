import { IsInt, Min } from 'class-validator';

/** Create a gateway deposit charge (amount in integer cents). */
export class CreateDepositDto {
  @IsInt()
  @Min(100) // R$1 minimum
  amountCents!: number;
}
