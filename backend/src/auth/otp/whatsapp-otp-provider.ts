import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OtpDelivery } from './otp-provider';

/**
 * Delivers OTP codes over WhatsApp via the Meta (WhatsApp Cloud) API.
 *
 * WhatsApp business-initiated messages must use a pre-approved template, and
 * login codes specifically must use an **Authentication** category template
 * (body param = the code, plus a copy-code/one-tap button carrying the code).
 * We keep generating/verifying the code ourselves — this only sends it.
 *
 * Required config (env):
 *   WHATSAPP_PHONE_NUMBER_ID – Cloud API sender's phone-number id
 *   WHATSAPP_TOKEN           – access token
 *   WHATSAPP_OTP_TEMPLATE    – approved Authentication template name (e.g. "login_code")
 * Optional:
 *   WHATSAPP_OTP_LANG        – template language, default "pt_BR"
 *   WHATSAPP_OTP_BUTTON      – "false" to omit the button param (body-only template)
 *   WHATSAPP_API_VERSION     – default "v21.0"
 */
@Injectable()
export class WhatsAppOtpProvider implements OtpDelivery {
  private readonly logger = new Logger('WhatsAppOtpProvider');

  constructor(private readonly config: ConfigService) {}

  /** True only when the sender id, token, and OTP template are all configured. */
  static isConfigured(config: ConfigService): boolean {
    return (
      !!config.get<string>('WHATSAPP_PHONE_NUMBER_ID') &&
      !!config.get<string>('WHATSAPP_TOKEN') &&
      !!config.get<string>('WHATSAPP_OTP_TEMPLATE')
    );
  }

  async send(phone: string, code: string): Promise<void> {
    const phoneNumberId = this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID')!;
    const token = this.config.get<string>('WHATSAPP_TOKEN')!;
    const template = this.config.get<string>('WHATSAPP_OTP_TEMPLATE')!;
    const lang = this.config.get<string>('WHATSAPP_OTP_LANG') ?? 'pt_BR';
    const withButton = this.config.get<string>('WHATSAPP_OTP_BUTTON') !== 'false';
    const version = this.config.get<string>('WHATSAPP_API_VERSION') ?? 'v21.0';

    // Meta expects the recipient as E.164 digits without the leading '+'.
    const to = phone.replace(/[^\d]/g, '');

    const components: unknown[] = [
      { type: 'body', parameters: [{ type: 'text', text: code }] },
    ];
    if (withButton) {
      // Authentication templates carry the code again in the copy-code button.
      components.push({
        type: 'button',
        sub_type: 'url',
        index: 0,
        parameters: [{ type: 'text', text: code }],
      });
    }

    const res = await fetch(
      `https://graph.facebook.com/${version}/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'template',
          template: { name: template, language: { code: lang }, components },
        }),
      },
    );

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      // Never log the code; log status + Meta error so failures are diagnosable.
      this.logger.error(
        `WhatsApp OTP to ${to} failed: HTTP ${res.status} ${detail.slice(0, 300)}`,
      );
      throw new Error(`WhatsApp OTP delivery failed (HTTP ${res.status}).`);
    }
    this.logger.log(`OTP WhatsApp message sent to ${to}.`);
  }
}
