import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WalletModule } from '../wallet/wallet.module';
import { PaymentsController } from './payments.controller';
import { PaymentsWebhookController } from './payments-webhook.controller';
import { PaymentsService } from './payments.service';
import { PaymentOrdersService } from './payment-orders.service';
import { SubscriptionRequestService } from './subscription-request.service';
import { InfinitePayClient } from './infinitepay.client';
import { ResponsibleModule } from '../responsible/responsible.module';

@Module({
  imports: [
    AuthModule, // provides JwtService for JwtAuthGuard
    WalletModule, // WalletService (credit the wallet on paid webhook)
    ResponsibleModule, // PlayerLimitService gates deposits
  ],
  controllers: [PaymentsController, PaymentsWebhookController],
  providers: [PaymentsService, PaymentOrdersService, SubscriptionRequestService, InfinitePayClient],
  exports: [PaymentsService, PaymentOrdersService, SubscriptionRequestService],
})
export class PaymentsModule {}
