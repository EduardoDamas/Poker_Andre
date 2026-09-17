import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Withdrawal } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from './ledger.service';
import { WalletService } from './wallet.service';
import { ensureAccount } from './account-util';

// Singleton system account that holds funds reserved for pending payouts.
const CLEARING_ACCOUNT_ID = '00000000-0000-0000-0000-000000000002';
const EXTERNAL_ACCOUNT_ID = '00000000-0000-0000-0000-000000000001';

/**
 * Manual Pix withdrawal flow (Phase 1).
 *
 *   request  : PLAYER -> WITHDRAWAL_CLEARING   (funds reserved, status REQUESTED)
 *   approve  : WITHDRAWAL_CLEARING -> EXTERNAL  (admin paid the Pix, status PAID)
 *   reject   : WITHDRAWAL_CLEARING -> PLAYER    (funds returned, status REJECTED)
 *
 * Reserving on request prevents a player from spending money that is already
 * promised to a pending withdrawal (no double-spend).
 */
@Injectable()
export class WithdrawalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly wallet: WalletService,
  ) {}

  private async clearingAccountId(): Promise<string> {
    const account = await ensureAccount(
      this.prisma,
      { id: CLEARING_ACCOUNT_ID },
      { id: CLEARING_ACCOUNT_ID, type: 'WITHDRAWAL_CLEARING' },
    );
    return account.id;
  }

  /** Player requests a payout. Reserves the funds immediately. */
  async request(userId: string, amountCents: bigint, pixKey: string): Promise<Withdrawal> {
    if (amountCents <= 0n) {
      throw new BadRequestException('Withdrawal amount must be a positive number of cents.');
    }
    if (!pixKey?.trim()) {
      throw new BadRequestException('A Pix key is required.');
    }

    const player = await this.wallet.ensurePlayerAccount(userId);
    const available = await this.ledger.balanceOf(player.id);
    if (available < amountCents) {
      throw new BadRequestException('Insufficient balance for this withdrawal.');
    }

    const clearingId = await this.clearingAccountId();

    // Reserve the funds FIRST, then record the withdrawal. The id is minted here
    // so the posting can reference it. Order matters: if the reservation fails
    // (e.g. a concurrent debit emptied the wallet), no REQUESTED row is left
    // behind for an admin to pay out against money that was never reserved.
    const id = randomUUID();
    const txnId = await this.ledger.post({
      kind: 'WITHDRAWAL',
      referenceId: `wd-req-${id}`,
      memo: `Withdrawal requested by ${userId}`,
      postings: [
        { accountId: player.id, amountCents: -amountCents },
        { accountId: clearingId, amountCents: amountCents },
      ],
      // The balance check above races with any other debit; this one runs inside
      // the posting transaction, so the wallet can never go negative.
      requireNonNegative: [
        { accountId: player.id, message: 'Insufficient balance for this withdrawal.' },
      ],
    });

    return this.prisma.withdrawal.create({
      data: { id, userId, amountCents, pixKey, status: 'REQUESTED', requestTxnId: txnId },
    });
  }

  /** Admin confirms the manual Pix transfer was made. Funds leave the system. */
  async approve(withdrawalId: string, adminNote?: string): Promise<Withdrawal> {
    const wd = await this.getRequested(withdrawalId);
    const clearingId = await this.clearingAccountId();

    const txnId = await this.ledger.post({
      kind: 'WITHDRAWAL',
      referenceId: `wd-pay-${wd.id}`,
      memo: `Withdrawal paid (manual Pix) ${wd.id}`,
      postings: [
        { accountId: clearingId, amountCents: -wd.amountCents },
        { accountId: EXTERNAL_ACCOUNT_ID, amountCents: wd.amountCents },
      ],
    });

    return this.prisma.withdrawal.update({
      where: { id: wd.id },
      data: { status: 'PAID', settleTxnId: txnId, adminNote, settledAt: new Date() },
    });
  }

  /** Admin rejects the request. Reserved funds return to the player. */
  async reject(withdrawalId: string, adminNote?: string): Promise<Withdrawal> {
    const wd = await this.getRequested(withdrawalId);
    const clearingId = await this.clearingAccountId();
    const player = await this.wallet.ensurePlayerAccount(wd.userId);

    const txnId = await this.ledger.post({
      kind: 'WITHDRAWAL',
      referenceId: `wd-rej-${wd.id}`,
      memo: `Withdrawal rejected ${wd.id}`,
      postings: [
        { accountId: clearingId, amountCents: -wd.amountCents },
        { accountId: player.id, amountCents: wd.amountCents },
      ],
    });

    return this.prisma.withdrawal.update({
      where: { id: wd.id },
      data: { status: 'REJECTED', settleTxnId: txnId, adminNote, settledAt: new Date() },
    });
  }

  // A withdrawal can only be settled once, and only from the REQUESTED state.
  private async getRequested(withdrawalId: string): Promise<Withdrawal> {
    const wd = await this.prisma.withdrawal.findUnique({ where: { id: withdrawalId } });
    if (!wd) throw new NotFoundException('Withdrawal not found.');
    if (wd.status !== 'REQUESTED') {
      throw new BadRequestException(`Withdrawal is already ${wd.status}.`);
    }
    return wd;
  }
}
