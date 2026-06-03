import { Injectable, Logger } from '@nestjs/common';

/**
 * Delivers OTP codes to a phone. Phase 1 dev implementation logs the code
 * instead of sending an SMS, and remembers the last code per phone so e2e
 * tests can read it. Swap for Twilio/Zenvia/Firebase in production.
 */
@Injectable()
export class DevOtpProvider {
  private readonly logger = new Logger('DevOtpProvider');
  private readonly lastCodes = new Map<string, string>();

  async send(phone: string, code: string): Promise<void> {
    this.lastCodes.set(phone, code);
    this.logger.log(`[DEV] OTP for ${phone}: ${code}`);
  }

  /** Test/dev helper — the most recent code sent to a phone. */
  lastCodeFor(phone: string): string | undefined {
    return this.lastCodes.get(phone);
  }
}
