import { PrismaClient } from '@prisma/client';
import { LedgerService } from './ledger.service';
import { WalletService } from './wallet.service';
import { WithdrawalService } from './withdrawal.service';
import { PrismaService } from '../prisma/prisma.service';
import { TournamentService } from '../tournament/tournament.service';
import { resetDb } from '../test-utils/reset-db';

/**
 * A wallet must never go negative, even when two debits land at the same instant.
 * The balance check before a posting can be passed by both racers; the guard
 * inside the transaction is what actually holds.
 */
describe('overdraft protection (concurrent debits)', () => {
  let prisma: PrismaClient;
  let ledger: LedgerService;
  let wallet: WalletService;
  let withdrawals: WithdrawalService;
  let tourn: TournamentService;
  let counter = 0;

  beforeAll(() => {
    prisma = new PrismaClient();
    ledger = new LedgerService(prisma as unknown as PrismaService);
    wallet = new WalletService(prisma as unknown as PrismaService, ledger);
    withdrawals = new WithdrawalService(prisma as unknown as PrismaService, ledger, wallet);
    tourn = new TournamentService(prisma as unknown as PrismaService, ledger, wallet);
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
        phone: `+5511933300${counter.toString().padStart(3, '0')}`,
        displayName: `O${counter}`,
        cpf: `8000000000${counter.toString().padStart(2, '0')}`,
        birthDate: new Date('1990-01-01'),
      },
    });
    if (cents > 0n) await wallet.deposit(user.id, cents);
    return user.id;
  }

  const settled = (results: PromiseSettledResult<unknown>[]) => ({
    ok: results.filter((r) => r.status === 'fulfilled').length,
    failed: results.filter((r) => r.status === 'rejected').length,
  });

  it('entering two rooms at the same instant charges only one entry', async () => {
    const u = await fundedUser(2000n); // exactly one level-1 entry
    const results = await Promise.allSettled([
      tourn.escrowEntry({ tournamentId: 'poker-l1', userId: u, level: 1, subscription: 'NONE' }),
      tourn.escrowEntry({ tournamentId: 'poker-l1-b', userId: u, level: 1, subscription: 'NONE' }),
    ]);

    expect(settled(results)).toEqual({ ok: 1, failed: 1 });
    expect(await wallet.getBalance(u)).toBe(0n);
  });

  it('eight simultaneous entries with money for three charge exactly three', async () => {
    const u = await fundedUser(6000n); // three entries
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, (_, i) =>
        tourn.escrowEntry({ tournamentId: `room-${i}`, userId: u, level: 1, subscription: 'NONE' }),
      ),
    );

    expect(settled(results)).toEqual({ ok: 3, failed: 5 });
    expect(await wallet.getBalance(u)).toBe(0n);
  });

  it('two withdrawals at the same instant reserve only one', async () => {
    const u = await fundedUser(5000n);
    const results = await Promise.allSettled([
      withdrawals.request(u, 5000n, 'pix@example.com'),
      withdrawals.request(u, 5000n, 'pix@example.com'),
    ]);

    expect(settled(results)).toEqual({ ok: 1, failed: 1 });
    expect(await wallet.getBalance(u)).toBe(0n);
    // The rejected one leaves no record for an admin to pay out.
    expect(await prisma.withdrawal.count({ where: { userId: u } })).toBe(1);
  });

  it('a withdrawal racing a tournament entry cannot overdraw', async () => {
    const u = await fundedUser(2000n);
    const results = await Promise.allSettled([
      withdrawals.request(u, 2000n, 'pix@example.com'),
      tourn.escrowEntry({ tournamentId: 'poker-l1', userId: u, level: 1, subscription: 'NONE' }),
    ]);

    expect(settled(results)).toEqual({ ok: 1, failed: 1 });
    expect(await wallet.getBalance(u)).toBe(0n);
  });

  it('the ledger still balances after the rejected attempts', async () => {
    const u = await fundedUser(2000n);
    await Promise.allSettled([
      tourn.escrowEntry({ tournamentId: 'a', userId: u, level: 1, subscription: 'NONE' }),
      tourn.escrowEntry({ tournamentId: 'b', userId: u, level: 1, subscription: 'NONE' }),
      withdrawals.request(u, 2000n, 'pix@example.com').catch(() => null),
    ]);

    const all = await prisma.ledgerEntry.aggregate({ _sum: { amountCents: true } });
    expect(all._sum.amountCents ?? 0n).toBe(0n);
    expect(await wallet.getBalance(u)).toBeGreaterThanOrEqual(0n);
  });
});
