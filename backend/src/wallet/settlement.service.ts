import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from './ledger.service';
import { WalletService } from './wallet.service';
import { ensureAccount } from './account-util';

// Singleton system accounts.
const PRIZE_POOL_ID = '00000000-0000-0000-0000-000000000003'; // chips escrowed on the table
const HOUSE_RAKE_ID = '00000000-0000-0000-0000-000000000004'; // platform commission

export interface SeatSettlement {
  userId: string;
  /** Chips the player put on the table (cents). */
  buyInCents: bigint;
  /** Chips the player has after the hand (cents). */
  finalStackCents: bigint;
}

/**
 * Settles a finished poker hand into the money ledger.
 *
 * For each seat the wallet pays the buy-in into the PRIZE_POOL escrow and gets
 * the final stack back; the house takes the rake. The whole hand is ONE balanced
 * double-entry transaction (atomic, idempotent per hand), so money is conserved:
 *   Σ buy-ins == Σ final stacks + rake.
 */
@Injectable()
export class SettlementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly wallet: WalletService,
  ) {}

  private async systemAccount(id: string, type: 'PRIZE_POOL' | 'HOUSE_RAKE'): Promise<string> {
    const account = await ensureAccount(this.prisma, { id }, { id, type });
    return account.id;
  }

  async settleHand(params: {
    handId: string;
    seats: SeatSettlement[];
    rakeCents?: bigint;
  }): Promise<string> {
    const { handId, seats } = params;
    const rake = params.rakeCents ?? 0n;
    if (rake < 0n) throw new BadRequestException('Rake cannot be negative.');
    if (seats.length === 0) throw new BadRequestException('No seats to settle.');

    const totalBuyIn = seats.reduce((s, x) => s + x.buyInCents, 0n);
    const totalFinal = seats.reduce((s, x) => s + x.finalStackCents, 0n);
    // The hand must balance against the engine result (chip conservation).
    if (totalBuyIn !== totalFinal + rake) {
      throw new BadRequestException(
        `Settlement does not balance: buy-ins ${totalBuyIn} != final ${totalFinal} + rake ${rake}.`,
      );
    }

    const prizeId = await this.systemAccount(PRIZE_POOL_ID, 'PRIZE_POOL');
    const rakeAccId = await this.systemAccount(HOUSE_RAKE_ID, 'HOUSE_RAKE');

    const postings: { accountId: string; amountCents: bigint }[] = [];
    for (const seat of seats) {
      if (seat.buyInCents <= 0n) throw new BadRequestException('Buy-in must be positive.');
      if (seat.finalStackCents < 0n) throw new BadRequestException('Final stack cannot be negative.');

      const account = await this.wallet.ensurePlayerAccount(seat.userId);
      const balance = await this.ledger.balanceOf(account.id);
      if (balance < seat.buyInCents) {
        throw new BadRequestException(`Insufficient balance to buy in for ${seat.userId}.`);
      }

      // Buy-in: wallet -> escrow.
      postings.push({ accountId: account.id, amountCents: -seat.buyInCents });
      postings.push({ accountId: prizeId, amountCents: seat.buyInCents });
      // Return the final stack: escrow -> wallet.
      if (seat.finalStackCents > 0n) {
        postings.push({ accountId: prizeId, amountCents: -seat.finalStackCents });
        postings.push({ accountId: account.id, amountCents: seat.finalStackCents });
      }
    }

    // Rake: escrow -> house. After this the escrow nets to zero.
    if (rake > 0n) {
      postings.push({ accountId: prizeId, amountCents: -rake });
      postings.push({ accountId: rakeAccId, amountCents: rake });
    }

    return this.ledger.post({
      kind: 'TOURNAMENT_PAYOUT',
      referenceId: `hand-${handId}`,
      memo: `Hand ${handId} settlement (rake ${rake})`,
      postings,
    });
  }
}
