import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { isValidCpf, normalizeCpf } from './cpf';
import { isAdult } from './age';
import { RegisterDto } from './dto/register.dto';

export type PublicUser = Pick<User, 'id' | 'phone' | 'displayName' | 'status'>;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
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

  /** The current user's public profile (for GET /auth/me). */
  async me(userId: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User no longer exists.');
    return this.toPublic(user);
  }

  private toPublic(user: User): PublicUser {
    return {
      id: user.id,
      phone: user.phone,
      displayName: user.displayName,
      status: user.status,
    };
  }
}
