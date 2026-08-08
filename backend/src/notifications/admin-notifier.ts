import { Injectable } from '@nestjs/common';

/** DI token for the active admin-notification channel. */
export const ADMIN_NOTIFIER = Symbol('ADMIN_NOTIFIER');

/**
 * Delivers an admin alert over some channel. The default logs; a WhatsApp or
 * e-mail adapter can be swapped in by binding ADMIN_NOTIFIER to it in the module.
 */
export interface AdminNotifier {
  send(message: string): Promise<void>;
}

/** Default channel — logs the alert. Replace with WhatsApp/e-mail later. */
@Injectable()
export class LogAdminNotifier implements AdminNotifier {
  async send(message: string): Promise<void> {
    // eslint-disable-next-line no-console
    console.log(`[ADMIN NOTIFY]\n${message}`);
  }
}
