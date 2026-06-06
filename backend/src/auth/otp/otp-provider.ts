import { Injectable, Logger } from '@nestjs/common';

export interface PendingOtp {
  phone: string;
  code: string;
  requestedAt: number; // epoch ms
}

/**
 * Delivers OTP codes to a phone. Phase 1 dev implementation logs the code
 * instead of sending an SMS, and remembers the last code per phone so e2e
 * tests can read it. Swap for Twilio/Zenvia/Firebase in production.
 */
@Injectable()
export class DevOtpProvider {
  private readonly logger = new Logger('DevOtpProvider');
  private readonly lastCodes = new Map<string, string>();
  private readonly requests: PendingOtp[] = [];

  async send(phone: string, code: string): Promise<void> {
    this.lastCodes.set(phone, code);
    this.requests.push({ phone, code, requestedAt: Date.now() });
    this.logger.log(`[DEV] OTP for ${phone}: ${code}`);
  }

  /** The most recent code sent to a phone. */
  lastCodeFor(phone: string): string | undefined {
    return this.lastCodes.get(phone);
  }

  /** All OTP requests from the last [windowMs] milliseconds (default 10 min). */
  recentRequests(windowMs = 10 * 60 * 1000): PendingOtp[] {
    const since = Date.now() - windowMs;
    return this.requests
      .filter((r) => r.requestedAt >= since)
      .slice()
      .reverse(); // newest first
  }
}
