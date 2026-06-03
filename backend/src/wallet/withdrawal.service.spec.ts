import { PrismaClient } from '@prisma/client';
import { LedgerService } from './ledger.service';
import { WalletService } from './wallet.service';
import { WithdrawalService } from './withdrawal.service';
import { PrismaService } from '../prisma/prisma.service';
import { resetDb } from '../test-utils/reset-db';

/**
 * STEP A3 gate — manual Pix withdrawal lifecycle.
 * request -> (approve | reject), with funds reserved on request.
 */
describe('WithdrawalService (manual Pix lifecycle)', () => {
  let prisma: PrismaClient;
  let wallet: WalletService;
  let withdrawals: WithdrawalService;
  let userId: string;
  let counter = 0;

  const PIX = 'player@example.com';

  beforeAll(() => {
    prisma = new PrismaClient();
    const ledger = new LedgerService(prisma as unknown as PrismaService);
    wallet = new WalletService(prisma as unknown as PrismaService, ledger);
    withdrawals = new WithdrawalService(
      prisma as unknown as PrismaService,
      ledger,
      wallet,
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);

    counter += 1;
    const user = await prisma.user.create({
      data: {
        phone: `+55119100000${counter.toString().padStart(2, '0')}`,
        displayName: `Player ${counter}`,
        cpf: `1000000000${counter.toString().padStart(2, '0')}`,
        birthDate: new Date('1990-01-01'),
      },
    });
    userId = user.id;
    // Fund the wallet with R$100,00 for each scenario.
    await wallet.deposit(userId, 10000n);
  });

  // Helper: the whole system must always net to zero (conservation of money).
  async function totalLedger(): Promise<bigint> {
    const agg = await prisma.ledgerEntry.aggregate({ _sum: { amountCents: true } });
    return agg._sum.amountCents ?? 0n;
  }

  it('request reserves funds: balance drops, status REQUESTED', async () => {
    const wd = await withdrawals.request(userId, 4000n, PIX);
    expect(wd.status).toBe('REQUESTED');
    // Reserved out of the player's available balance.
    expect(await wallet.getBalance(userId)).toBe(6000n);
    expect(await totalLedger()).toBe(0n);
  });

  it('approve (paid) settles the withdrawal; money leaves the system', async () => {
    const wd = await withdrawals.request(userId, 4000n, PIX);
    const paid = await withdrawals.approve(wd.id, 'paid via bank app');
    expect(paid.status).toBe('PAID');
    expect(paid.settledAt).toBeTruthy();
    // Player keeps the reduced balance; clearing is back to zero.
    expect(await wallet.getBalance(userId)).toBe(6000n);
    const clearing = await prisma.account.findFirst({ where: { type: 'WITHDRAWAL_CLEARING' } });
    expect(clearing?.balanceCents).toBe(0n);
    expect(await totalLedger()).toBe(0n);
  });

  it('reject returns the reserved funds to the player', async () => {
    const wd = await withdrawals.request(userId, 4000n, PIX);
    const rejected = await withdrawals.reject(wd.id, 'invalid Pix key');
    expect(rejected.status).toBe('REJECTED');
    // Full balance restored.
    expect(await wallet.getBalance(userId)).toBe(10000n);
    expect(await totalLedger()).toBe(0n);
  });

  it('rejects a withdrawal larger than the balance (no double-spend)', async () => {
    await expect(withdrawals.request(userId, 20000n, PIX)).rejects.toThrow(/Insufficient/);
    expect(await wallet.getBalance(userId)).toBe(10000n);
  });

  it('reserved funds cannot be withdrawn again (double-spend blocked)', async () => {
    await withdrawals.request(userId, 7000n, PIX); // balance now 3000
    // A second request for more than the *remaining* balance must fail.
    await expect(withdrawals.request(userId, 5000n, PIX)).rejects.toThrow(/Insufficient/);
    expect(await wallet.getBalance(userId)).toBe(3000n);
  });

  it('a settled withdrawal cannot be settled again', async () => {
    const wd = await withdrawals.request(userId, 4000n, PIX);
    await withdrawals.approve(wd.id);
    await expect(withdrawals.approve(wd.id)).rejects.toThrow(/already PAID/);
    await expect(withdrawals.reject(wd.id)).rejects.toThrow(/already PAID/);
  });

  it('requires a Pix key', async () => {
    await expect(withdrawals.request(userId, 4000n, '  ')).rejects.toThrow(/Pix key/);
  });

  it('conserves money across a full mixed sequence', async () => {
    const a = await withdrawals.request(userId, 3000n, PIX);
    const b = await withdrawals.request(userId, 2000n, PIX);
    await withdrawals.approve(a.id); // 3000 leaves the system
    await withdrawals.reject(b.id); // 2000 returns to player
    // Player: 10000 - 3000(paid out) = 7000 remaining.
    expect(await wallet.getBalance(userId)).toBe(7000n);
    expect(await totalLedger()).toBe(0n);
  });
});
