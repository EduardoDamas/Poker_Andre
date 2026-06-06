import { Controller, Get, Post, Query, Body, UnauthorizedException, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from './admin.guard';
import { DevOtpProvider, PendingOtp } from '../auth/otp/otp-provider';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Admin bootstrap endpoints — no JwtAuthGuard on the class so that
 * /admin/auth/login and the secret-gated OTP relay are accessible
 * before you have a token.
 */
@Controller('admin')
export class OtpRelayController {
  constructor(
    private readonly otpProvider: DevOtpProvider,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  // --- Admin password login ---

  /** POST /admin/auth/login  { username, password } → { accessToken } */
  @Post('auth/login')
  async login(
    @Body() body: { username?: string; password?: string },
  ): Promise<{ accessToken: string }> {
    const expectedUser = this.config.get<string>('ADMIN_USERNAME') ?? 'admin';
    const expectedPass = this.config.get<string>('ADMIN_PASSWORD');
    if (!expectedPass) throw new UnauthorizedException('Admin credentials not configured.');

    if (body.username !== expectedUser || body.password !== expectedPass) {
      throw new UnauthorizedException('Usuário ou senha incorretos.');
    }

    const accessToken = await this.jwt.signAsync({
      sub: 'admin',
      phone: '',
      role: 'ADMIN',
    });
    return { accessToken };
  }

  // --- OTP relay (secret-gated, no JWT needed) ---

  private checkSecret(secret: string): void {
    const expected = this.config.get<string>('ADMIN_OTP_SECRET');
    if (!expected || secret !== expected) throw new UnauthorizedException('Invalid secret.');
  }

  @Get('otp/last')
  lastOtp(
    @Query('phone') phone: string,
    @Query('secret') secret: string,
  ): { phone: string; code: string | null } {
    this.checkSecret(secret);
    return { phone, code: this.otpProvider.lastCodeFor(phone) ?? null };
  }

  // Bootstrap: promote a registered phone to ADMIN role.
  @Post('otp/promote')
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

  // --- Pending OTPs panel (requires admin JWT) ---

  /** GET /admin/otp/pending — live list of recent OTP requests (last 10 min). */
  @Get('otp/pending')
  @UseGuards(JwtAuthGuard, AdminGuard)
  pendingOtps(): PendingOtp[] {
    return this.otpProvider.recentRequests();
  }
}
