import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { User, Withdrawal, WithdrawalStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from '../wallet/ledger.service';
import { isBlocked } from '../auth/user-status';

// Amounts are returned as strings (cents) — BigInt is not JSON-serialisable and
// we never want to lose precision on money.
export interface AdminPlayer {
  id: string;
  displayName: string;
  phone: string;
  status: string;
  role: string;
  createdAt: Date;
  balanceCents: string;
  blocked: boolean;
  blockedUntil: Date | null;
  blockReason: string | null;
}

export interface AdminWithdrawal {
  id: string;
  userId: string;
  amountCents: string;
  pixKey: string;
  status: WithdrawalStatus;
  requestedAt: Date;
  settledAt: Date | null;
  adminNote: string | null;
}

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
  ) {}

  async listPlayers(): Promise<AdminPlayer[]> {
    const users = await this.prisma.user.findMany({ orderBy: { createdAt: 'desc' } });
    return Promise.all(
      users.map(async (u) => {
        const account = await this.prisma.account.findUnique({ where: { userId: u.id } });
        const balance = account ? await this.ledger.balanceOf(account.id) : 0n;
        return {
          id: u.id,
          displayName: u.displayName,
          phone: u.phone,
          status: u.status,
          role: u.role,
          createdAt: u.createdAt,
          balanceCents: balance.toString(),
          blocked: isBlocked(u),
          blockedUntil: u.blockedUntil,
          blockReason: u.blockReason,
        };
      }),
    );
  }

  async listWithdrawals(status?: WithdrawalStatus): Promise<AdminWithdrawal[]> {
    const withdrawals = await this.prisma.withdrawal.findMany({
      where: status ? { status } : undefined,
      orderBy: { requestedAt: 'desc' },
    });
    return withdrawals.map((w) => AdminService.serializeWithdrawal(w));
  }

  /**
   * Reject a user application. Only PENDING users (registered, never activated)
   * can be rejected. Deleting the row frees their phone + CPF so a new
   * registration can use them again.
   */
  async rejectApplication(userId: string): Promise<{ phone: string; cpf: string }> {
    const user = await this.requireUser(userId);
    if (user.status !== 'PENDING') {
      throw new BadRequestException('Only pending applications can be rejected.');
    }
    // Free the unique slots: remove the user (and their empty account).
    await this.prisma.account.deleteMany({ where: { userId } });
    await this.prisma.user.delete({ where: { id: userId } });
    return { phone: user.phone, cpf: user.cpf };
  }

  /**
   * Block a user. Temporary block: pass `untilMs` (epoch ms) in the future.
   * Permanent: omit `untilMs`. Cannot block an admin.
   */
  async blockUser(userId: string, reason: string, untilMs?: number): Promise<User> {
    const user = await this.requireUser(userId);
    if (user.role === 'ADMIN') throw new BadRequestException('Cannot block an admin.');
    const blockedUntil = untilMs != null ? new Date(untilMs) : null;
    if (blockedUntil && blockedUntil.getTime() <= Date.now()) {
      throw new BadRequestException('Block expiry must be in the future.');
    }
    return this.prisma.user.update({
      where: { id: userId },
      data: { status: 'BLOCKED', blockReason: reason, blockedUntil },
    });
  }

  /** Lift a block (temporary or permanent). */
  async unblockUser(userId: string): Promise<User> {
    await this.requireUser(userId);
    return this.prisma.user.update({
      where: { id: userId },
      data: { status: 'ACTIVE', blockReason: null, blockedUntil: null },
    });
  }

  private async requireUser(userId: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found.');
    return user;
  }

  // BigInt-safe view of a withdrawal (amount as a string).
  static serializeWithdrawal(w: Withdrawal): AdminWithdrawal {
    return {
      id: w.id,
      userId: w.userId,
      amountCents: w.amountCents.toString(),
      pixKey: w.pixKey,
      status: w.status,
      requestedAt: w.requestedAt,
      settledAt: w.settledAt,
      adminNote: w.adminNote,
    };
  }
}
