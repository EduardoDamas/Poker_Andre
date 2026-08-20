import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WalletModule } from '../wallet/wallet.module';
import { PaymentsController } from './payments.controller';
import { PaymentsWebhookController } from './payments-webhook.controller';
import { PaymentsService } from './payments.service';
import { PaymentOrdersService } from './payment-orders.service';
import { InfinitePayClient } from './infinitepay.client';

@Module({
  imports: [
    AuthModule, // provides JwtService for JwtAuthGuard
    WalletModule, // WalletService (credit the wallet on paid webhook)
  ],
  controllers: [PaymentsController, PaymentsWebhookController],
  providers: [PaymentsService, PaymentOrdersService, InfinitePayClient],
  exports: [PaymentsService, PaymentOrdersService],
})
export class PaymentsModule {}
