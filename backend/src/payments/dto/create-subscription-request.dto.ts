import { IsIn } from 'class-validator';

const PURCHASABLE = ['MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL'];

export class CreateSubscriptionRequestDto {
  @IsIn(PURCHASABLE, { message: 'plan must be one of: ' + PURCHASABLE.join(', ') })
  plan!: string;
}
