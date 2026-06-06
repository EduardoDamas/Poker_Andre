import { Controller, Get, Post, Query, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DevOtpProvider } from '../auth/otp/otp-provider';
import { PrismaService } from '../prisma/prisma.service';

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
    private readonly prisma: PrismaService,
  ) {}

  private checkSecret(secret: string): void {
    const expected = this.config.get<string>('ADMIN_OTP_SECRET');
    if (!expected || secret !== expected) throw new UnauthorizedException('Invalid secret.');
  }

  @Get('last')
  lastOtp(
    @Query('phone') phone: string,
    @Query('secret') secret: string,
  ): { phone: string; code: string | null } {
    this.checkSecret(secret);
    return { phone, code: this.otpProvider.lastCodeFor(phone) ?? null };
  }

  // One-time bootstrap: promote a registered phone to ADMIN role.
  // POST /admin/otp/promote?phone=+55...&secret=YOUR_SECRET
  @Post('promote')
  async promote(
    @Query('phone') phone: string,
    @Query('secret') secret: string,
  ): Promise<{ ok: boolean; phone: string; role: string }> {
    this.checkSecret(secret);
    const user = await this.prisma.user.update({
      where: { phone },
      data: { role: 'ADMIN' },
    });
    return { ok: true, phone: user.phone, role: user.role };
  }
}
