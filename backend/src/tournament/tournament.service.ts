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
    const referenceId = `tourn-entry-${tournamentId}-${userId}`;

    // Idempotent: if this entry was already escrowed (e.g. the server restarted and
    // lost its in-memory tournament state), reuse the existing transaction instead
    // of charging again or throwing a duplicate-referenceId error. This lets an
    // already-paid player re-enter the same room after a redeploy.
    const existing = await this.prisma.ledgerTransaction.findUnique({ where: { referenceId } });
    if (existing) return { txnId: existing.id, entryCents };

    const player = await this.wallet.ensurePlayerAccount(userId);
    const balance = await this.ledger.balanceOf(player.id);
    if (balance < entryCents) {
      throw new BadRequestException('Saldo insuficiente para a inscrição.');
    }
    const prizeId = await this.systemAccount(PRIZE_POOL_ID, 'PRIZE_POOL');

    const txnId = await this.ledger.post({
      kind: 'TOURNAMENT_BUYIN',
      referenceId,
      memo: `Inscrição torneio ${tournamentId} nível ${level} (${subscription})`,
      postings: [
        { accountId: player.id, amountCents: -entryCents },
        { accountId: prizeId, amountCents: entryCents },
      ],
      // The check above races: entering two rooms at the same instant, both
      // could pass it. This one runs inside the posting transaction, so the
      // second entry is rejected instead of overdrawing the wallet.
      requireNonNegative: [
        { accountId: player.id, message: 'Saldo insuficiente para a inscrição.' },
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
    /**
     * Share of the money collected that may be paid out, as an integer percent.
     * 100 (the default) is the CAPACONTEST table as written: the winner's share
     * of a pool capped at everything collected. The scheduled 10-minute rooms
     * pass 50 so the house always keeps at least half — the client's call
     * (2026-09-17), to be raised back once the subscriber base grows.
     */
    prizePoolSharePct?: number;
  }): Promise<TournamentPayout> {
    const { tournamentId, level, winnerId, winnerSubscription, participants } = params;
    const capacity = params.capacity ?? PHASE1_ROOM_CAPACITY;
    const sharePct = BigInt(params.prizePoolSharePct ?? 100);

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
    // Never pay out more than the room may pay: the table's multiplier, capped
    // at the payable share of what was actually collected.
    const payableCents = (collectedCents * sharePct) / 100n;
    const prizePoolCents = prizeRaw < payableCents ? prizeRaw : payableCents;
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

    // Record the win — feeds the rankings, the winners feed, and the
    // share-your-win reward.
    await this.prisma.tournamentWin.create({
      data: { userId: winnerId, level, prizeCents: winnerCents, multiplier },
    });

    // This tournament INSTANCE is finished — release its idempotency keys so
    // the static lobby room (poker-l1..l7) can host a fresh tournament: the
    // next payout must not collide, and returning players must pay a NEW
    // entry (the old escrow reference would otherwise be reused as a free
    // ticket forever). Renaming keeps the audit trail intact.
    await this.releaseReferences(tournamentId, participants.map((p) => p.userId), txnId);

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

  /**
   * Give every escrowed entry back — the room never reached its minimum, so no
   * tournament happened and nobody's money may stay with the house.
   *
   * Refunds the amount actually charged (read from the entry posting, not
   * recomputed, so a subscription change in between cannot alter it) and is
   * idempotent per (tournament, player). Afterwards the references are released
   * so the same room can run its next window and the player can enter again.
   */
  async refundEntries(
    tournamentId: string,
    userIds: string[],
  ): Promise<{ refunded: number; totalCents: bigint }> {
    const prizeId = await this.systemAccount(PRIZE_POOL_ID, 'PRIZE_POOL');
    let refunded = 0;
    let totalCents = 0n;

    for (const userId of userIds) {
      const entryRef = `tourn-entry-${tournamentId}-${userId}`;
      const refundRef = `tourn-refund-${tournamentId}-${userId}`;

      const entry = await this.prisma.ledgerTransaction.findUnique({
        where: { referenceId: entryRef },
        include: { entries: true },
      });
      if (!entry) continue; // never charged (or already released)
      const already = await this.prisma.ledgerTransaction.findUnique({
        where: { referenceId: refundRef },
      });
      if (already) continue; // refunded on an earlier pass

      const player = await this.wallet.ensurePlayerAccount(userId);
      const charged = entry.entries.find((e) => e.accountId === player.id)?.amountCents ?? 0n;
      const amount = -charged; // the player's leg was negative
      if (amount <= 0n) continue;

      await this.ledger.post({
        kind: 'TOURNAMENT_REFUND',
        referenceId: refundRef,
        memo: `Devolução da inscrição — torneio ${tournamentId} não atingiu o mínimo`,
        postings: [
          { accountId: prizeId, amountCents: -amount },
          { accountId: player.id, amountCents: amount },
        ],
      });
      refunded += 1;
      totalCents += amount;
    }

    await this.releaseReferences(tournamentId, userIds, `refunded-${Date.now()}`);
    return { refunded, totalCents };
  }

  /**
   * Give one player's entry back — they pulled out before the room started.
   * Only their own references are released, so everyone else keeps their seat.
   */
  async refundEntry(tournamentId: string, userId: string): Promise<boolean> {
    const { refunded } = await this.refundEntries(tournamentId, [userId]);
    return refunded === 1;
  }

  /**
   * Rename the entry/payout/refund referenceIds of a finished (settled,
   * refunded or abandoned) tournament instance by suffixing a unique tag,
   * freeing the static room id for the next instance while preserving the
   * ledger history.
   */
  async releaseReferences(tournamentId: string, userIds: string[], tag: string): Promise<void> {
    const refs = [
      `tourn-payout-${tournamentId}`,
      ...userIds.map((u) => `tourn-entry-${tournamentId}-${u}`),
      ...userIds.map((u) => `tourn-refund-${tournamentId}-${u}`),
    ];
    for (const ref of refs) {
      await this.prisma.ledgerTransaction.updateMany({
        where: { referenceId: ref },
        data: { referenceId: `${ref}#${tag}` },
      });
    }
  }
}
