import { Module } from '@nestjs/common';
import { ADMIN_NOTIFIER, LogAdminNotifier } from './admin-notifier';
import { AdminNotificationService } from './admin-notification.service';
import { WhatsAppAdminNotifier } from './whatsapp-notifier';

/**
 * Admin alerts. ADMIN_NOTIFIER resolves to WhatsApp when its env is configured
 * (WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_TOKEN / WHATSAPP_TO); otherwise it logs.
 */
@Module({
  providers: [
    LogAdminNotifier,
    WhatsAppAdminNotifier,
    {
      provide: ADMIN_NOTIFIER,
      inject: [WhatsAppAdminNotifier, LogAdminNotifier],
      useFactory: (whatsapp: WhatsAppAdminNotifier, log: LogAdminNotifier) =>
        WhatsAppAdminNotifier.isConfigured() ? whatsapp : log,
    },
    AdminNotificationService,
  ],
  exports: [AdminNotificationService],
})
export class NotificationsModule {}
