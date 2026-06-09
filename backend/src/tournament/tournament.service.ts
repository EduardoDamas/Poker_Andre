import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from '../wallet/ledger.service';
import { WalletService } from '../wallet/wallet.service';
import { ensureAccount } from '../wallet/account-util';
import { multiplierFor } from '../poker/prize-table';
import { Subscription, entryFeeCents, prizeShareCents } from './subscription';

// Singleton system accounts (shared with SettlementService).
const PRIZE_POOL_ID = '00000000-0000-0000-0000-000000000003';
const HOUSE_RAKE_ID = '00000000-0000-0000-0000-000000000004';

// Phase 1: one 8-seat table IS the room, so a full table = 100% occupancy.
// (The full CAPACONTEST model is 100 tables × 8 = 800; that's a Phase-2 concern.)
export const PHASE1_ROOM_CAPACITY = 8;

export interface Participant {
  userId: string;
  subscription: Subscription;
}

export interface TournamentPayout {
  txnId: string;
  collectedCents: bigint;
  prizePoolCents: bigint;
  winnerCents: bigint;
  houseCents: bigint;
  occupancy: number;
  multiplier: number;
}

/**
 * Money flow for an eliminatory tournament room.
 *
 *   entry  : PLAYER -> PRIZE_POOL          (entry fee / V.I. escrowed on join)
 *   payout : PRIZE_POOL -> winner PLAYER   (prize × subscription share)
 *            PRIZE_POOL -> HOUSE_RAKE       (remainder)
 *
 * Prize = multiplier(occupancy) × base V.I. (não-assinante fee for the level),
 * capped at the total collected so the house never overpays. The winner then
 * receives their subscription's share of that prize (§6); the rest is house.
 *
 * Robot/practice matches NEVER call this — only real-vs-real tournaments move
 * money (see TableService.settle gating).
 */
@Injectable()
export class TournamentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly wallet: WalletService,
  ) {}

  private async systemAccount(id: string, type: 'PRIZE_POOL' | 'HOUSE_RAKE'): Promise<string> {
    return (await ensureAccount(this.prisma, { id }, { id, type })).id;
  }

  /** Escrow one player's entry fee. Idempotent per (tournamentId, userId). */
  async escrowEntry(params: {
    tournamentId: string;
    userId: string;
    level: number;
    subscription: Subscription;
  }): Promise<{ txnId: string; entryCents: bigint }> {
    const { tournamentId, userId, level, subscription } = params;
    const entryCents = entryFeeCents(level, subscription);

    const player = await this.wallet.ensurePlayerAccount(userId);
    const balance = await this.ledger.balanceOf(player.id);
    if (balance < entryCents) {
      throw new BadRequestException('Saldo insuficiente para a inscrição.');
    }
    const prizeId = await this.systemAccount(PRIZE_POOL_ID, 'PRIZE_POOL');

    const txnId = await this.ledger.post({
      kind: 'TOURNAMENT_BUYIN',
      referenceId: `tourn-entry-${tournamentId}-${userId}`,
      memo: `Inscrição torneio ${tournamentId} nível ${level} (${subscription})`,
      postings: [
        { accountId: player.id, amountCents: -entryCents },
        { accountId: prizeId, amountCents: entryCents },
      ],
    });
    return { txnId, entryCents };
  }

  /**
   * Pay the tournament winner and sweep the remainder to the house. One balanced
   * transaction; idempotent per tournament.
   */
  async settle(params: {
    tournamentId: string;
    level: number;
    winnerId: string;
    winnerSubscription: Subscription;
    participants: Participant[];
    capacity?: number;
  }): Promise<TournamentPayout> {
    const { tournamentId, level, winnerId, winnerSubscription, participants } = params;
    const capacity = params.capacity ?? PHASE1_ROOM_CAPACITY;

    if (participants.length === 0) throw new BadRequestException('No participants.');
    if (!participants.some((p) => p.userId === winnerId)) {
      throw new BadRequestException('Winner is not a participant.');
    }

    // Total escrowed = sum of each participant's own entry fee.
    const collectedCents = participants.reduce(
      (sum, p) => sum + entryFeeCents(level, p.subscription),
      0n,
    );

    const occupancy = participants.length / capacity;
    const multiplier = multiplierFor(occupancy);
    const baseViCents = entryFeeCents(level, 'NONE');
    const prizeRaw = baseViCents * BigInt(multiplier);
    const prizePoolCents = prizeRaw < collectedCents ? prizeRaw : collectedCents; // never overpay
    const winnerCents = prizeShareCents(prizePoolCents, winnerSubscription);
    const houseCents = collectedCents - winnerCents; // everything not paid out is house

    const prizeId = await this.systemAccount(PRIZE_POOL_ID, 'PRIZE_POOL');
    const rakeId = await this.systemAccount(HOUSE_RAKE_ID, 'HOUSE_RAKE');
    const winnerAcc = await this.wallet.ensurePlayerAccount(winnerId);

    const postings = [{ accountId: prizeId, amountCents: -collectedCents }];
    if (winnerCents > 0n) postings.push({ accountId: winnerAcc.id, amountCents: winnerCents });
    if (houseCents > 0n) postings.push({ accountId: rakeId, amountCents: houseCents });

    const txnId = await this.ledger.post({
      kind: 'TOURNAMENT_PAYOUT',
      referenceId: `tourn-payout-${tournamentId}`,
      memo: `Prêmio torneio ${tournamentId}: ${multiplier}× ocupação ${(occupancy * 100).toFixed(0)}%`,
      postings,
    });

    return {
      txnId,
      collectedCents,
      prizePoolCents,
      winnerCents,
      houseCents,
      occupancy,
      multiplier,
    };
  }
}
