import { Body, Controller, HttpCode, Post, Query } from '@nestjs/common';
import { PaymentOrdersService } from './payment-orders.service';

/**
 * Public (no-auth) gateway callbacks. Authenticity is checked inside the service
 * via the shared token carried on the webhook URL (?token=...).
 */
@Controller('payments/webhook')
export class PaymentsWebhookController {
  constructor(private readonly orders: PaymentOrdersService) {}

  /** POST /payments/webhook/infinitepay?token=... — payment status callback. */
  @Post('infinitepay')
  @HttpCode(200)
  infinitepay(
    @Body() payload: unknown,
    @Query('token') token?: string,
  ): Promise<{ ok: boolean; credited: boolean }> {
    return this.orders.handleInfinitePayWebhook(payload, token);
  }
}
