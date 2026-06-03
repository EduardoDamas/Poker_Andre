import { BadRequestException, Injectable } from '@nestjs/common';
import { Account } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from './ledger.service';

// Fixed id for the singleton EXTERNAL account (the "outside world" counter-account
// for deposits/withdrawals). A constant id makes the upsert race-safe.
const EXTERNAL_ACCOUNT_ID = '00000000-0000-0000-0000-000000000001';

@Injectable()
export class WalletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
  ) {}

  /**
   * Ensures a user has exactly one PLAYER account. Called when a user is created
   * (auth module) and defensively before any wallet operation. Race-safe via the
   * unique constraint on Account.userId.
   */
  async ensurePlayerAccount(userId: string): Promise<Account> {
    return this.prisma.account.upsert({
      where: { userId },
      update: {},
      create: { type: 'PLAYER', userId },
    });
  }

  /** The single EXTERNAL system account, created on first use. */
  private async externalAccountId(): Promise<string> {
    const account = await this.prisma.account.upsert({
      where: { id: EXTERNAL_ACCOUNT_ID },
      update: {},
      create: { id: EXTERNAL_ACCOUNT_ID, type: 'EXTERNAL' },
    });
    return account.id;
  }

  /**
   * Credit a player's wallet (EXTERNAL → PLAYER) via a balanced ledger posting.
   * @param amountCents positive integer cents.
   */
  async deposit(
    userId: string,
    amountCents: bigint,
    opts?: { referenceId?: string; memo?: string },
  ): Promise<string> {
    if (amountCents <= 0n) {
      throw new BadRequestException('Deposit amount must be a positive number of cents.');
    }
    const player = await this.ensurePlayerAccount(userId);
    const externalId = await this.externalAccountId();

    return this.ledger.post({
      kind: 'DEPOSIT',
      referenceId: opts?.referenceId,
      memo: opts?.memo,
      postings: [
        { accountId: externalId, amountCents: -amountCents },
        { accountId: player.id, amountCents },
      ],
    });
  }

  /**
   * Authoritative wallet balance for a user (sum of ledger entries).
   * Returns 0 if the user has no account yet.
   */
  async getBalance(userId: string): Promise<bigint> {
    const account = await this.prisma.account.findUnique({ where: { userId } });
    if (!account) return 0n;
    return this.ledger.balanceOf(account.id);
  }
}
