import { Injectable } from '@nestjs/common';
import { WithdrawalStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from '../wallet/ledger.service';

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
        };
      }),
    );
  }

  async listWithdrawals(status?: WithdrawalStatus): Promise<AdminWithdrawal[]> {
    const withdrawals = await this.prisma.withdrawal.findMany({
      where: status ? { status } : undefined,
      orderBy: { requestedAt: 'desc' },
    });
    return withdrawals.map((w) => ({
      id: w.id,
      userId: w.userId,
      amountCents: w.amountCents.toString(),
      pixKey: w.pixKey,
      status: w.status,
      requestedAt: w.requestedAt,
      settledAt: w.settledAt,
      adminNote: w.adminNote,
    }));
  }
}
