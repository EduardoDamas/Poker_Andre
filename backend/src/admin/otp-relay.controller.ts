import { Controller, Get, Query, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DevOtpProvider } from '../auth/otp/otp-provider';

/**
 * Single-purpose endpoint so the admin can read the last OTP for a phone
 * without opening Railway logs. Protected by a static secret (ADMIN_OTP_SECRET
 * env var) instead of a JWT so it's usable before you have a token.
 *
 * Usage:
 *   GET /admin/otp/last?phone=+55...&secret=YOUR_SECRET
 */
@Controller('admin/otp')
export class OtpRelayController {
  constructor(
    private readonly otpProvider: DevOtpProvider,
    private readonly config: ConfigService,
  ) {}

  @Get('last')
  lastOtp(
    @Query('phone') phone: string,
    @Query('secret') secret: string,
  ): { phone: string; code: string | null } {
    const expected = this.config.get<string>('ADMIN_OTP_SECRET');
    if (!expected || secret !== expected) {
      throw new UnauthorizedException('Invalid secret.');
    }
    return { phone, code: this.otpProvider.lastCodeFor(phone) ?? null };
  }
}
