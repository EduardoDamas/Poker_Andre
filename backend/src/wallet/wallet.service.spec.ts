import { PrismaClient } from '@prisma/client';
import { LedgerService } from './ledger.service';
import { WalletService } from './wallet.service';
import { PrismaService } from '../prisma/prisma.service';
import { resetDb } from '../test-utils/reset-db';

/**
 * STEP A2 gate — wallet deposit & balance.
 * All amounts are integer cents (bigint): no floats anywhere in the money path.
 */
describe('WalletService (deposit & balance)', () => {
  let prisma: PrismaClient;
  let wallet: WalletService;
  let userId: string;
  let counter = 0;

  beforeAll(() => {
    prisma = new PrismaClient();
    const ledger = new LedgerService(prisma as unknown as PrismaService);
    wallet = new WalletService(prisma as unknown as PrismaService, ledger);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);

    // A user with a unique phone/CPF per test (compliance fields validated later).
    counter += 1;
    const user = await prisma.user.create({
      data: {
        phone: `+55119000000${counter.toString().padStart(2, '0')}`,
        displayName: `Player ${counter}`,
        cpf: `0000000000${counter.toString().padStart(2, '0')}`,
        birthDate: new Date('1990-01-01'),
      },
    });
    userId = user.id;
  });

  it('auto-creates a PLAYER account for the user on first use', async () => {
    expect(await prisma.account.findUnique({ where: { userId } })).toBeNull();
    await wallet.ensurePlayerAccount(userId);
    const account = await prisma.account.findUnique({ where: { userId } });
    expect(account?.type).toBe('PLAYER');
  });

  it('deposits R$100,00 and reports exactly 10000 cents', async () => {
    await wallet.deposit(userId, 10000n);
    const balance = await wallet.getBalance(userId);
    expect(balance).toBe(10000n);
    expect(typeof balance).toBe('bigint'); // never a float
  });

  it('accumulates multiple deposits to the exact cent', async () => {
    await wallet.deposit(userId, 10000n);
    await wallet.deposit(userId, 5000n);
    await wallet.deposit(userId, 1n); // one cent
    expect(await wallet.getBalance(userId)).toBe(15001n);
  });

  it('rejects a zero or negative deposit', async () => {
    await expect(wallet.deposit(userId, 0n)).rejects.toThrow(/positive/);
    await expect(wallet.deposit(userId, -500n)).rejects.toThrow(/positive/);
    expect(await wallet.getBalance(userId)).toBe(0n);
  });

  it('returns 0 for a user with no account yet', async () => {
    expect(await wallet.getBalance(userId)).toBe(0n);
  });

  it('keeps the EXTERNAL account as a single mirror of all deposits', async () => {
    await wallet.deposit(userId, 7000n);
    await wallet.deposit(userId, 3000n);
    const externals = await prisma.account.findMany({ where: { type: 'EXTERNAL' } });
    expect(externals).toHaveLength(1); // singleton
    expect(externals[0].balanceCents).toBe(-10000n); // money that left the outside world
  });
});
