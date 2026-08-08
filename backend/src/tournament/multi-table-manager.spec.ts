import { PrismaClient } from '@prisma/client';
import { LedgerService } from '../wallet/ledger.service';
import { WalletService } from '../wallet/wallet.service';
import { TournamentService } from '../tournament/tournament.service';
import { PrismaService } from '../prisma/prisma.service';
import { resetDb } from '../test-utils/reset-db';
import { AdminNotificationService } from '../notifications/admin-notification.service';
import { MultiTableTournamentManager, SubTableRunner } from './multi-table-manager';

describe('MultiTableTournamentManager (live lifecycle)', () => {
  let prisma: PrismaClient;
  let wallet: WalletService;
  let ledger: LedgerService;
  let tournament: TournamentService;
  let manager: MultiTableTournamentManager;
  let alerts: string[];
  let counter = 0;

  beforeAll(() => {
    prisma = new PrismaClient();
    ledger = new LedgerService(prisma as unknown as PrismaService);
    wallet = new WalletService(prisma as unknown as PrismaService, ledger);
    tournament = new TournamentService(prisma as unknown as PrismaService, ledger, wallet);
    alerts = [];
    const adminNotify = new AdminNotificationService({ send: async (m) => void alerts.push(m) });
    manager = new MultiTableTournamentManager(tournament, adminNotify);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    alerts = [];
  });

  async function fundedUser(cents: bigint): Promise<string> {
    counter += 1;
    const u = await prisma.user.create({
      data: {
        phone: `+55118${counter.toString().padStart(8, '0')}`,
        displayName: `LM${counter}`,
        cpf: `8${counter.toString().padStart(10, '0')}`,
        birthDate: new Date('1990-01-01'),
      },
    });
    await wallet.deposit(u.id, cents);
    return u.id;
  }

  async function balanceOf(userId: string): Promise<bigint> {
    const acc = await prisma.account.findUnique({ where: { userId } });
    return acc ? ledger.balanceOf(acc.id) : 0n;
  }

  // Instant runner: each sub-table's first-seated player wins.
  const firstWins: SubTableRunner = { play: async (_id, _lvl, players) => players[0] };

  it('registers + escrows 80 players, runs to a champion, settles, conserves money', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 80; i++) {
      ids.push(await fundedUser(2000n));
      await manager.register('mtt-live', 1, ids[i], 'NONE');
    }
    expect(manager.registered('mtt-live')).toBe(80);

    const { championId, payout } = await manager.start('mtt-live', 1, firstWins);

    expect(championId).toBe(ids[0]);
    expect(payout.multiplier).toBe(20); // 80 / 800 = 10%
    expect(payout.winnerCents).toBe(10000n); // R$100 (NONE 25% of R$400)

    expect(await balanceOf(championId)).toBe(10000n);
    let players = 0n;
    for (const id of ids) players += await balanceOf(id);
    expect(players).toBe(10000n);

    const all = await prisma.ledgerEntry.aggregate({ _sum: { amountCents: true } });
    expect(all._sum.amountCents).toBe(0n); // money conserved

    // Admin got the prize alert, and the roster was cleared.
    expect(alerts.some((m) => m.includes('mtt-live') && m.includes('R$ 100,00'))).toBe(true);
    expect(manager.registered('mtt-live')).toBe(0);
  });

  it('is idempotent per user and rejects starting an empty tournament', async () => {
    const u = await fundedUser(2000n);
    expect(await manager.register('t2', 1, u, 'NONE')).toBe(1);
    expect(await manager.register('t2', 1, u, 'NONE')).toBe(1); // same user, no double escrow
    await expect(manager.start('empty', 1, firstWins)).rejects.toThrow();
  });
});
