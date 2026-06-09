import { PrismaClient } from '@prisma/client';
import { LedgerService } from './ledger.service';
import { WalletService } from './wallet.service';
import { DepositService } from './deposit.service';
import { PrismaService } from '../prisma/prisma.service';
import { resetDb } from '../test-utils/reset-db';

describe('DepositService (manual Pix)', () => {
  let prisma: PrismaClient;
  let ledger: LedgerService;
  let wallet: WalletService;
  let deposits: DepositService;
  let counter = 0;

  beforeAll(() => {
    prisma = new PrismaClient();
    ledger = new LedgerService(prisma as unknown as PrismaService);
    wallet = new WalletService(prisma as unknown as PrismaService, ledger);
    deposits = new DepositService(prisma as unknown as PrismaService, wallet);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
  });

  async function newUser(): Promise<string> {
    counter += 1;
    const u = await prisma.user.create({
      data: {
        phone: `+5511955500${counter.toString().padStart(3, '0')}`,
        displayName: `D${counter}`,
        cpf: `5000000000${counter.toString().padStart(2, '0')}`,
        birthDate: new Date('1990-01-01'),
      },
    });
    return u.id;
  }

  async function balanceOf(userId: string): Promise<bigint> {
    const acc = await prisma.account.findUnique({ where: { userId } });
    return acc ? ledger.balanceOf(acc.id) : 0n;
  }

  it('request does not move money; confirm credits the wallet', async () => {
    const u = await newUser();
    const dep = await deposits.request(u, 5000n, 'E2E-PIX-123');
    expect(dep.status).toBe('REQUESTED');
    expect(await balanceOf(u)).toBe(0n); // nothing credited yet

    const confirmed = await deposits.confirm(dep.id);
    expect(confirmed.status).toBe('CONFIRMED');
    expect(await balanceOf(u)).toBe(5000n);
  });

  it('reject does not credit anything', async () => {
    const u = await newUser();
    const dep = await deposits.request(u, 5000n);
    await deposits.reject(dep.id, 'comprovante inválido');
    expect(await balanceOf(u)).toBe(0n);
  });

  it('cannot confirm twice', async () => {
    const u = await newUser();
    const dep = await deposits.request(u, 5000n);
    await deposits.confirm(dep.id);
    await expect(deposits.confirm(dep.id)).rejects.toThrow(/já está/i);
    expect(await balanceOf(u)).toBe(5000n); // credited once
  });

  it('rejects a non-positive amount', async () => {
    const u = await newUser();
    await expect(deposits.request(u, 0n)).rejects.toThrow(/positivo/i);
  });
});
