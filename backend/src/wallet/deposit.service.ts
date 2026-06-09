import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Deposit } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from './wallet.service';

/**
 * Manual Pix deposit flow (Phase 1).
 *
 *   request : player declares an incoming Pix       (status REQUESTED, no money moves)
 *   confirm : admin verifies receipt → credit wallet (EXTERNAL -> PLAYER, status CONFIRMED)
 *   reject  : admin rejects                          (status REJECTED, no money moves)
 *
 * Money only moves on confirm, via WalletService.deposit (a balanced ledger
 * posting, idempotent on the deposit id). A real payment gateway would replace
 * the manual confirm with a verified webhook — the ledger effect is identical.
 */
@Injectable()
export class DepositService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
  ) {}

  /** Player declares an incoming Pix of [amountCents]. */
  async request(userId: string, amountCents: bigint, pixReference?: string): Promise<Deposit> {
    if (amountCents <= 0n) {
      throw new BadRequestException('O valor do depósito deve ser positivo.');
    }
    return this.prisma.deposit.create({
      data: { userId, amountCents, pixReference, status: 'REQUESTED' },
    });
  }

  /** Admin confirms the Pix was received → credit the wallet. */
  async confirm(depositId: string, adminNote?: string): Promise<Deposit> {
    const dep = await this.getRequested(depositId);

    const txnId = await this.wallet.deposit(dep.userId, dep.amountCents, {
      referenceId: `deposit-${dep.id}`,
      memo: `Depósito Pix confirmado ${dep.id}`,
    });

    return this.prisma.deposit.update({
      where: { id: dep.id },
      data: { status: 'CONFIRMED', creditTxnId: txnId, adminNote, settledAt: new Date() },
    });
  }

  /** Admin rejects the declared deposit. No money moves. */
  async reject(depositId: string, adminNote?: string): Promise<Deposit> {
    const dep = await this.getRequested(depositId);
    return this.prisma.deposit.update({
      where: { id: dep.id },
      data: { status: 'REJECTED', adminNote, settledAt: new Date() },
    });
  }

  /** Pending deposits for the admin queue (newest first). */
  list(status?: 'REQUESTED' | 'CONFIRMED' | 'REJECTED'): Promise<Deposit[]> {
    return this.prisma.deposit.findMany({
      where: status ? { status } : undefined,
      orderBy: { requestedAt: 'desc' },
    });
  }

  private async getRequested(depositId: string): Promise<Deposit> {
    const dep = await this.prisma.deposit.findUnique({ where: { id: depositId } });
    if (!dep) throw new NotFoundException('Depósito não encontrado.');
    if (dep.status !== 'REQUESTED') {
      throw new BadRequestException(`Depósito já está ${dep.status}.`);
    }
    return dep;
  }
}
