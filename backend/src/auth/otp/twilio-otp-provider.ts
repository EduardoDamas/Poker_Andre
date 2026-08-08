import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OtpDelivery } from './otp-provider';

/**
 * Sends OTP codes over SMS via Twilio's Programmable Messaging REST API.
 * We keep generating/verifying the code ourselves (OtpService) — Twilio only
 * delivers the message. Called directly over HTTPS so no SDK dependency is added.
 *
 * Required config (env):
 *   TWILIO_ACCOUNT_SID   – account SID (starts "AC…")
 *   TWILIO_AUTH_TOKEN    – auth token
 * Sender (one of):
 *   TWILIO_MESSAGING_SERVICE_SID – a Messaging Service (starts "MG…"), OR
 *   TWILIO_FROM                  – a Twilio phone number in E.164 (+1…)
 */
@Injectable()
export class TwilioOtpProvider implements OtpDelivery {
  private readonly logger = new Logger('TwilioOtpProvider');

  constructor(private readonly config: ConfigService) {}

  /** True only when the SID/token and a sender are all configured. */
  static isConfigured(config: ConfigService): boolean {
    return (
      !!config.get<string>('TWILIO_ACCOUNT_SID') &&
      !!config.get<string>('TWILIO_AUTH_TOKEN') &&
      (!!config.get<string>('TWILIO_MESSAGING_SERVICE_SID') ||
        !!config.get<string>('TWILIO_FROM'))
    );
  }

  async send(phone: string, code: string): Promise<void> {
    const sid = this.config.get<string>('TWILIO_ACCOUNT_SID')!;
    const token = this.config.get<string>('TWILIO_AUTH_TOKEN')!;
    const messagingServiceSid = this.config.get<string>('TWILIO_MESSAGING_SERVICE_SID');
    const from = this.config.get<string>('TWILIO_FROM');

    const body = new URLSearchParams({
      To: phone,
      Body: `Seu código de acesso CAPA CONTEST é: ${code}. Válido por 5 minutos. Não compartilhe.`,
    });
    if (messagingServiceSid) {
      body.set('MessagingServiceSid', messagingServiceSid);
    } else {
      body.set('From', from!);
    }

    const auth = Buffer.from(`${sid}:${token}`).toString('base64');
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      },
    );

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      // Never log the code; log status + Twilio error so failures are diagnosable.
      this.logger.error(`Twilio SMS to ${phone} failed: HTTP ${res.status} ${detail}`);
      throw new Error(`SMS delivery failed (HTTP ${res.status}).`);
    }
    this.logger.log(`OTP SMS sent to ${phone}.`);
  }
}
