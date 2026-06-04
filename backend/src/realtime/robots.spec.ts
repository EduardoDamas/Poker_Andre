import { PrismaClient } from '@prisma/client';
import { LedgerService } from '../wallet/ledger.service';
import { WalletService } from '../wallet/wallet.service';
import { SettlementService } from '../wallet/settlement.service';
import { TableService } from './table.service';
import { PrismaService } from '../prisma/prisma.service';
import { resetDb } from '../test-utils/reset-db';

/**
 * Robot online matches — auto-fill, robot replacement, and the money rule:
 * NO deductions when robots are present; only all-real matches settle.
 */
describe('TableService robots', () => {
  let prisma: PrismaClient;
  let wallet: WalletService;
  let tables: TableService;
  let counter = 0;

  beforeAll(() => {
    prisma = new PrismaClient();
    const ledger = new LedgerService(prisma as unknown as PrismaService);
    wallet = new WalletService(prisma as unknown as PrismaService, ledger);
    const settlement = new SettlementService(prisma as unknown as PrismaService, ledger, wallet);
    tables = new TableService(settlement);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
  });

  async function fundedUser(cents: bigint): Promise<string> {
    counter += 1;
    const u = await prisma.user.create({
      data: {
        phone: `+5511966600${counter.toString().padStart(3, '0')}`,
        displayName: `R${counter}`,
        cpf: `6600000000${counter.toString().padStart(2, '0')}`,
        birthDate: new Date('1990-01-01'),
      },
    });
    await wallet.deposit(u.id, cents);
    return u.id;
  }

  // Drive a table to hand completion (robots + a passive real player).
  async function playOut(tableId: string, realId: string): Promise<boolean> {
    for (let i = 0; i < 200; i++) {
      const t = tables.getTable(tableId)!;
      if (!t.hand) return true;
      const acting = t.hand.actingPlayerId;
      if (!acting) return true;
      const action = tables.isRobotSeat(t, acting)
        ? tables.robotDecision(t)
        : t.hand.legalActions().includes('check')
          ? { type: 'check' as const }
          : { type: 'call' as const };
      const res = await tables.act(tableId, acting, action);
      if (res.complete) return true;
    }
    return false;
  }

  it('fills a waiting room with robots and the hand plays out', async () => {
    const user = await fundedUser(100n);
    const { table } = tables.join('rt', user, 'sock1', 3);
    expect(tables.realPlayerCount(table)).toBe(1);

    const added = tables.fillWithRobots(table);
    expect(added).toBe(2); // 3 seats, 1 real → 2 robots
    expect(tables.hasRobots(table)).toBe(true);

    expect(tables.startHand(table)).toBe(true);
    expect(await playOut('rt', user)).toBe(true);
  });

  it('does NOT deduct from the wallet in a robot match', async () => {
    const user = await fundedUser(100n);
    const { table } = tables.join('rt2', user, 'sock1', 3);
    tables.fillWithRobots(table);
    tables.startHand(table);
    await playOut('rt2', user);

    // No settlement happened → wallet unchanged.
    expect(await wallet.getBalance(user)).toBe(100n);
  });

  it('a real user replaces a robot when joining a robot-filled room', async () => {
    const u1 = await fundedUser(100n);
    const { table } = tables.join('rt3', u1, 'sock1', 3);
    tables.fillWithRobots(table); // now 1 real + 2 robots (full)
    expect(tables.realPlayerCount(table)).toBe(1);

    const u2 = await fundedUser(100n);
    tables.join('rt3', u2, 'sock2'); // replaces a robot
    const t = tables.getTable('rt3')!;
    expect(tables.realPlayerCount(t)).toBe(2);
    expect(tables.hasRobots(t)).toBe(true); // 1 robot remains
  });
});
