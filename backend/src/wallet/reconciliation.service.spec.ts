import { PrismaClient } from '@prisma/client';
import { LedgerService } from './ledger.service';
import { WalletService } from './wallet.service';
import { ReconciliationService } from './reconciliation.service';
import { PrismaService } from '../prisma/prisma.service';
import { resetDb } from '../test-utils/reset-db';

/**
 * STEP G2 gate — reconciliation detects cache drift and system imbalance.
 */
describe('ReconciliationService', () => {
  let prisma: PrismaClient;
  let wallet: WalletService;
  let recon: ReconciliationService;
  let counter = 0;

  beforeAll(() => {
    prisma = new PrismaClient();
    const ledger = new LedgerService(prisma as unknown as PrismaService);
    wallet = new WalletService(prisma as unknown as PrismaService, ledger);
    recon = new ReconciliationService(prisma as unknown as PrismaService, ledger);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
  });

  async function fundedUser(cents: bigint): Promise<string> {
    counter += 1;
    const user = await prisma.user.create({
      data: {
        phone: `+5511922200${counter.toString().padStart(3, '0')}`,
        displayName: `R${counter}`,
        cpf: `2200000000${counter.toString().padStart(2, '0')}`,
        birthDate: new Date('1990-01-01'),
      },
    });
    await wallet.deposit(user.id, cents);
    return user.id;
  }

  it('reports OK on a healthy ledger', async () => {
    await fundedUser(5000n);
    await fundedUser(3000n);

    const report = await recon.run();
    expect(report.ok).toBe(true);
    expect(report.discrepancies).toHaveLength(0);
    expect(report.systemOk).toBe(true);
    expect(report.systemBalanceCents).toBe(0n);
    expect(report.accountsChecked).toBeGreaterThan(0);
  });

  it('detects a corrupted cached balance', async () => {
    const userId = await fundedUser(5000n);
    const account = await prisma.account.findUniqueOrThrow({ where: { userId } });

    // Corrupt the cache (NOT the ledger) — simulate drift / bad write.
    await prisma.account.update({ where: { id: account.id }, data: { balanceCents: 9999n } });

    const report = await recon.run();
    expect(report.ok).toBe(false);
    expect(report.discrepancies).toHaveLength(1);
    expect(report.discrepancies[0]).toMatchObject({
      accountId: account.id,
      cachedCents: 9999n,
      actualCents: 5000n, // the ledger truth is unchanged
      diffCents: 4999n,
    });
    // The ledger itself still nets to zero — only the cache drifted.
    expect(report.systemOk).toBe(true);
  });

  it('repairs drifted cache rows from the ledger truth', async () => {
    const userId = await fundedUser(5000n);
    const account = await prisma.account.findUniqueOrThrow({ where: { userId } });
    await prisma.account.update({ where: { id: account.id }, data: { balanceCents: -1n } });

    const fixed = await recon.repairCachedBalances();
    expect(fixed).toBe(1);

    const after = await recon.run();
    expect(after.ok).toBe(true);
    const repaired = await prisma.account.findUniqueOrThrow({ where: { id: account.id } });
    expect(repaired.balanceCents).toBe(5000n);
  });

  it('detects a system imbalance (an unbalanced ledger entry)', async () => {
    const userId = await fundedUser(5000n);
    const account = await prisma.account.findUniqueOrThrow({ where: { userId } });

    // Inject a bogus single-sided entry, bypassing LedgerService's balance check.
    const txn = await prisma.ledgerTransaction.create({ data: { kind: 'ADJUSTMENT' } });
    await prisma.ledgerEntry.create({
      data: { transactionId: txn.id, accountId: account.id, amountCents: 100n },
    });

    const system = await recon.checkSystemBalance();
    expect(system.ok).toBe(false);
    expect(system.totalCents).toBe(100n);

    const report = await recon.run();
    expect(report.ok).toBe(false);
    expect(report.systemOk).toBe(false);
  });
});
