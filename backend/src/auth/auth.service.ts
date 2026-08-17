import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { isValidCpf, normalizeCpf } from './cpf';
import { isAdult } from './age';
import { isBlocked } from './user-status';
import { hashPassword, verifyPassword } from './password';
import { RegisterDto } from './dto/register.dto';
import { AuthToken } from './otp/otp.service';

export type PublicUser = Pick<
  User,
  'id' | 'phone' | 'displayName' | 'status' | 'subscription'
>;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly jwt: JwtService,
  ) {}

  /**
   * Register a new player. Enforces compliance (valid CPF, 18+) and uniqueness,
   * then creates the user (PENDING) and their wallet account.
   */
  async register(dto: RegisterDto): Promise<PublicUser> {
    const cpf = normalizeCpf(dto.cpf);
    if (!isValidCpf(cpf)) {
      throw new BadRequestException('Invalid CPF.');
    }

    const birthDate = new Date(dto.birthDate);
    if (!isAdult(birthDate, new Date())) {
      throw new BadRequestException('You must be at least 18 years old.');
    }

    try {
      const user = await this.prisma.user.create({
        data: {
          phone: dto.phone,
          displayName: dto.displayName,
          cpf,
          birthDate,
          status: 'PENDING',
          ...(dto.password ? { passwordHash: hashPassword(dto.password) } : {}),
        },
      });
      // Every player gets a wallet account at registration.
      await this.wallet.ensurePlayerAccount(user.id);

      return this.toPublic(user);
    } catch (err) {
      // Unique violation on phone or cpf.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const target = (err.meta?.target as string[] | undefined)?.join(', ') ?? 'field';
        throw new ConflictException(`Already registered (${target}).`);
      }
      throw err;
    }
  }

  /**
   * Password login: verify phone + password, then issue a JWT (same shape as the
   * OTP flow). First successful login flips PENDING → ACTIVE, like OTP verify.
   * OTP delivery isn't required — used for testing before OTP is live.
   */
  async loginWithPassword(phone: string, password: string): Promise<AuthToken> {
    const user = await this.prisma.user.findUnique({ where: { phone } });
    // Same message whether the phone is unknown, has no password, or the password
    // is wrong — don't leak which accounts exist.
    if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
      throw new UnauthorizedException('Telefone ou senha inválidos.');
    }
    if (isBlocked(user)) {
      throw new UnauthorizedException(
        user.blockReason ? `Conta bloqueada: ${user.blockReason}` : 'Conta bloqueada.',
      );
    }
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

  /** The current user's public profile + wallet balance (for GET /auth/me). */
  async me(userId: string): Promise<PublicUser & { balanceCents: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User no longer exists.');
    const balance = await this.wallet.getBalance(userId);
    return { ...this.toPublic(user), balanceCents: balance.toString() };
  }

  private toPublic(user: User): PublicUser {
    return {
      id: user.id,
      phone: user.phone,
      displayName: user.displayName,
      status: user.status,
      subscription: user.subscription,
    };
  }
}
