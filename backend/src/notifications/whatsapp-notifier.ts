import { Injectable, Logger } from '@nestjs/common';
import { AdminNotifier } from './admin-notifier';

/**
 * Sends admin alerts to WhatsApp via the Meta (WhatsApp Cloud) API.
 *
 * Configured entirely from the environment so no secret lives in code:
 *   WHATSAPP_PHONE_NUMBER_ID — the Cloud API sender's phone-number id
 *   WHATSAPP_TOKEN           — the access token
 *   WHATSAPP_TO              — recipient in E.164 digits (e.g. 5513996001429)
 *   WHATSAPP_API_VERSION     — optional, defaults to v21.0
 *
 * When it isn't fully configured it no-ops (and logs), so the money flow works
 * before the WhatsApp number is connected. Delivery failures throw and are
 * swallowed by AdminNotificationService (a lost alert never breaks a payout).
 */
@Injectable()
export class WhatsAppAdminNotifier implements AdminNotifier {
  private readonly logger = new Logger('WhatsAppAdminNotifier');

  static isConfigured(): boolean {
    return Boolean(
      process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_TO,
    );
  }

  private config(): { url: string; token: string; to: string } | null {
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const token = process.env.WHATSAPP_TOKEN;
    const to = process.env.WHATSAPP_TO;
    if (!phoneNumberId || !token || !to) return null;
    const version = process.env.WHATSAPP_API_VERSION ?? 'v21.0';
    return { url: `https://graph.facebook.com/${version}/${phoneNumberId}/messages`, token, to };
  }

  async send(message: string): Promise<void> {
    const cfg = this.config();
    if (!cfg) {
      this.logger.warn(`WhatsApp not configured; alert not delivered:\n${message}`);
      return;
    }
    const res = await fetch(cfg.url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: cfg.to,
        type: 'text',
        text: { body: message },
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`WhatsApp send failed (${res.status}): ${body.slice(0, 200)}`);
    }
  }
}
