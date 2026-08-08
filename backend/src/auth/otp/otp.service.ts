import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomInt } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { OTP_DELIVERY, OtpDelivery } from './otp-provider';
import { isBlocked } from '../user-status';

const CODE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ATTEMPTS = 5;
// Rate limit: cap OTP *requests* per phone (sending SMS costs money / can be abused).
const MAX_REQUESTS_PER_WINDOW = 5;
const REQUEST_WINDOW_MS = 60 * 1000; // 1 minute

export interface AuthToken {
  accessToken: string;
  user: { id: string; phone: string; displayName: string; status: string };
}

@Injectable()
export class OtpService {
  // In-memory sliding window of recent request timestamps per phone.
  private readonly recentRequests = new Map<string, number[]>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    @Inject(OTP_DELIVERY) private readonly delivery: OtpDelivery,
  ) {}

  // Throttle OTP requests per phone; throws 429 when the window limit is hit.
  private enforceRateLimit(phone: string): void {
    const now = Date.now();
    const recent = (this.recentRequests.get(phone) ?? []).filter(
      (t) => now - t < REQUEST_WINDOW_MS,
    );
    if (recent.length >= MAX_REQUESTS_PER_WINDOW) {
      throw new HttpException(
        'Too many code requests. Please wait a minute and try again.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    recent.push(now);
    this.recentRequests.set(phone, recent);
  }

  // Codes are bound to the phone before hashing so a code can't be replayed for
  // a different number.
  private hash(phone: string, code: string): string {
    return createHash('sha256').update(`${phone}:${code}`).digest('hex');
  }

  /** Generate, store (hashed) and deliver a 6-digit login code. */
  async request(phone: string): Promise<void> {
    this.enforceRateLimit(phone);
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    await this.prisma.otpCode.create({
      data: {
        phone,
        codeHash: this.hash(phone, code),
        expiresAt: new Date(Date.now() + CODE_TTL_MS),
      },
    });
    await this.delivery.send(phone, code);
  }

  /**
   * Verify a code and, on success, issue a JWT. The user must already be
   * registered; a successful verification marks them ACTIVE (phone confirmed).
   */
  async verify(phone: string, code: string): Promise<AuthToken> {
    const challenge = await this.prisma.otpCode.findFirst({
      where: { phone, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (!challenge) throw new UnauthorizedException('No active code. Request a new one.');
    if (challenge.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Code expired. Request a new one.');
    }
    if (challenge.attempts >= MAX_ATTEMPTS) {
      throw new UnauthorizedException('Too many attempts. Request a new code.');
    }

    if (challenge.codeHash !== this.hash(phone, code)) {
      await this.prisma.otpCode.update({
        where: { id: challenge.id },
        data: { attempts: { increment: 1 } },
      });
      throw new UnauthorizedException('Invalid code.');
    }

    // Correct code — consume it (single use).
    await this.prisma.otpCode.update({
      where: { id: challenge.id },
      data: { consumedAt: new Date() },
    });

    const user = await this.prisma.user.findUnique({ where: { phone } });
    if (!user) throw new UnauthorizedException('Phone not registered.');

    // Still blocked (permanent, or temp block not yet expired) → deny.
    if (isBlocked(user)) {
      throw new UnauthorizedException(
        user.blockReason ? `Conta bloqueada: ${user.blockReason}` : 'Conta bloqueada.',
      );
    }
    // PENDING → ACTIVE on first verify; an EXPIRED temp block auto-reactivates.
    if (user.status === 'PENDING' || user.status === 'BLOCKED') {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { status: 'ACTIVE', blockReason: null, blockedUntil: null },
      });
    }

    const accessToken = await this.jwt.signAsync({ sub: user.id, phone: user.phone });
    return {
      accessToken,
      user: { id: user.id, phone: user.phone, displayName: user.displayName, status: 'ACTIVE' },
    };
  }
}
