import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from './ledger.service';

/**
 * Money safety net.
 *
 * The ledger (sum of entries) is the source of truth; each account also caches a
 * `balanceCents` for fast reads. This service verifies the cache against the
 * ledger and that the whole system still nets to zero — catching any drift or
 * corruption before it becomes a dispute. Intended to run as a scheduled job
 * (e.g. nightly) and to back an admin "reconcile" button.
 */

export interface AccountDiscrepancy {
  accountId: string;
  cachedCents: bigint;
  actualCents: bigint;
  /** cached − actual (how far the cache has drifted). */
  diffCents: bigint;
}

export interface ReconciliationReport {
  ok: boolean;
  accountsChecked: number;
  discrepancies: AccountDiscrepancy[];
  systemBalanceCents: bigint; // must be 0
  systemOk: boolean;
}

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger('Reconciliation');

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
  ) {}

  /** Compare each account's cached balance against the sum of its ledger entries. */
  async checkAccounts(): Promise<AccountDiscrepancy[]> {
    const accounts = await this.prisma.account.findMany();
    const discrepancies: AccountDiscrepancy[] = [];
    for (const account of accounts) {
      const actual = await this.ledger.balanceOf(account.id);
      if (actual !== account.balanceCents) {
        discrepancies.push({
          accountId: account.id,
          cachedCents: account.balanceCents,
          actualCents: actual,
          diffCents: account.balanceCents - actual,
        });
      }
    }
    return discrepancies;
  }

  /** The entire ledger must sum to zero (no money created or destroyed). */
  async checkSystemBalance(): Promise<{ ok: boolean; totalCents: bigint }> {
    const agg = await this.prisma.ledgerEntry.aggregate({ _sum: { amountCents: true } });
    const total = agg._sum.amountCents ?? 0n;
    return { ok: total === 0n, totalCents: total };
  }

  /** Full report, suitable for a scheduled run or an admin endpoint. */
  async run(): Promise<ReconciliationReport> {
    const accounts = await this.prisma.account.count();
    const discrepancies = await this.checkAccounts();
    const system = await this.checkSystemBalance();

    const report: ReconciliationReport = {
      ok: discrepancies.length === 0 && system.ok,
      accountsChecked: accounts,
      discrepancies,
      systemBalanceCents: system.totalCents,
      systemOk: system.ok,
    };

    if (!report.ok) {
      this.logger.error(
        `Reconciliation FAILED: ${discrepancies.length} drifted account(s), system balance ${system.totalCents}.`,
      );
    }
    return report;
  }

  /**
   * Repair drifted cache rows by resetting each to the authoritative ledger sum.
   * Does NOT touch the ledger itself (the truth) — only the cached read column.
   * Returns the number of accounts corrected.
   */
  async repairCachedBalances(): Promise<number> {
    const discrepancies = await this.checkAccounts();
    for (const d of discrepancies) {
      await this.prisma.account.update({
        where: { id: d.accountId },
        data: { balanceCents: d.actualCents },
      });
    }
    return discrepancies.length;
  }
}
