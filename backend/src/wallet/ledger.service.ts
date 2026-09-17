import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, TxnKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** One leg of a double-entry posting. */
export interface Posting {
  accountId: string;
  /** Signed integer cents. Positive = into the account, negative = out. */
  amountCents: bigint;
}

@Injectable()
export class LedgerService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Post a balanced double-entry transaction.
   *
   * Invariants enforced here:
   *   1. The postings MUST sum to exactly 0 (conservation of money).
   *   2. At least two legs (it's "double" entry).
   *   3. `referenceId` makes the post idempotent — the same hand/withdrawal
   *      cannot be applied twice (DB unique constraint backs this up).
   *
   * Runs inside a serializable transaction so the cached account balances and
   * the ledger entries are updated atomically.
   */
  async post(params: {
    kind: TxnKind;
    postings: Posting[];
    referenceId?: string;
    memo?: string;
    /**
     * Accounts that must not end up negative. Checked INSIDE the transaction, so
     * two debits racing each other cannot both pass a check made beforehand —
     * the loser is serialised behind the winner and sees the real balance.
     */
    requireNonNegative?: { accountId: string; message: string }[];
  }): Promise<string> {
    const { kind, postings, referenceId, memo, requireNonNegative } = params;

    if (postings.length < 2) {
      throw new BadRequestException('A double-entry transaction needs at least two legs.');
    }
    const sum = postings.reduce((acc, p) => acc + p.amountCents, 0n);
    if (sum !== 0n) {
      throw new BadRequestException(`Unbalanced transaction: legs sum to ${sum}, must be 0.`);
    }

    return this.postWithRetry({ kind, postings, referenceId, memo, requireNonNegative });
  }

  // Serializable transactions on shared accounts (EXTERNAL, PRIZE_POOL, ...) can
  // conflict when many tables settle at once — or when a whole table enters a
  // tournament at the same instant. A write-conflict is transient (the attempt
  // was rolled back), so we retry with exponential, fully-jittered backoff so the
  // contenders spread out instead of colliding again. A unique-constraint
  // failure (duplicate referenceId) is NOT retried — it is a real idempotency rejection.
  private async postWithRetry(params: {
    kind: TxnKind;
    postings: Posting[];
    referenceId?: string;
    memo?: string;
    requireNonNegative?: { accountId: string; message: string }[];
  }): Promise<string> {
    const { kind, postings, referenceId, memo, requireNonNegative } = params;
    const MAX_ATTEMPTS = 16;

    for (let attempt = 1; ; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const txn = await tx.ledgerTransaction.create({
              data: {
                kind,
                referenceId,
                memo,
                entries: {
                  create: postings.map((p) => ({
                    accountId: p.accountId,
                    amountCents: p.amountCents,
                  })),
                },
              },
            });

            // Maintain the cached balance column. Source of truth remains the
            // ledger; this is a denormalised read accelerator, reconciled by a job.
            const after = new Map<string, bigint>();
            for (const p of postings) {
              const account = await tx.account.update({
                where: { id: p.accountId },
                data: { balanceCents: { increment: p.amountCents } },
              });
              after.set(p.accountId, account.balanceCents);
            }

            // Overdraft guard, inside the transaction: throwing rolls the whole
            // posting back, so no money moves and the balance never goes negative.
            for (const guard of requireNonNegative ?? []) {
              const balance = after.get(guard.accountId);
              if (balance != null && balance < 0n) {
                throw new BadRequestException(guard.message);
              }
            }

            return txn.id;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (e) {
        if (this.isWriteConflict(e) && attempt < MAX_ATTEMPTS) {
          await this.backoff(attempt);
          continue;
        }
        throw e;
      }
    }
  }

  // Postgres serialization failure / deadlock surfaces as Prisma P2034.
  private isWriteConflict(e: unknown): boolean {
    return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2034';
  }

  // Full jitter: a random wait in [0, cap), cap doubling from 5ms to 80ms. The
  // contended section is a single row update (milliseconds), so the point is to
  // spread contenders out, not to wait long — a big cap would just idle while
  // Postgres serialises the queue. Many short attempts beat a few long ones:
  // worst case ~1s across all retries.
  private backoff(attempt: number): Promise<void> {
    const cap = Math.min(5 * 2 ** (attempt - 1), 80);
    const ms = Math.floor(Math.random() * cap);
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Authoritative balance = SUM of ledger entries for the account.
   * Use this for anything that must be correct (withdrawals, disputes), not
   * the cached `balanceCents` column.
   */
  async balanceOf(accountId: string): Promise<bigint> {
    const agg = await this.prisma.ledgerEntry.aggregate({
      where: { accountId },
      _sum: { amountCents: true },
    });
    return agg._sum.amountCents ?? 0n;
  }
}
