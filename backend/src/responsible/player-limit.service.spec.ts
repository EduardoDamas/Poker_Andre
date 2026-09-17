import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { resetDb } from '../test-utils/reset-db';
import { PlayerLimitService, COOLING_OFF_HOURS } from './player-limit.service';

describe('PlayerLimitService (responsible gaming)', () => {
  let prisma: PrismaClient;
  let limits: PlayerLimitService;
  let counter = 0;

  beforeAll(() => {
    prisma = new PrismaClient();
    limits = new PlayerLimitService(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
  });

  async function player(): Promise<string> {
    counter += 1;
    const u = await prisma.user.create({
      data: {
        phone: `+5511966600${counter.toString().padStart(3, '0')}`,
        displayName: `L${counter}`,
        cpf: `7000000000${counter.toString().padStart(2, '0')}`,
        birthDate: new Date('1990-01-01'),
        status: 'ACTIVE',
      },
    });
    return u.id;
  }

  /** A deposit that has actually arrived, [hoursAgo] in the past. */
  async function confirmedDeposit(userId: string, cents: number, hoursAgo = 0) {
    const when = new Date(Date.now() - hoursAgo * 3600_000);
    await prisma.deposit.create({
      data: { userId, amountCents: BigInt(cents), status: 'CONFIRMED', requestedAt: when, settledAt: when },
    });
  }

  describe('setting ceilings', () => {
    it('starts with no limits', async () => {
      const v = await limits.get(await player());
      expect(v).toMatchObject({ dailyCents: null, weeklyCents: null, monthlyCents: null, selfExcluded: false });
      expect(v.used.daily).toBe(0n);
    });

    it('applies a new (tighter) limit immediately', async () => {
      const u = await player();
      const v = await limits.set(u, { dailyCents: 50_000n });
      expect(v.dailyCents).toBe(50_000n);
      expect(v.pending).toBeNull();
    });

    it('applies a decrease immediately', async () => {
      const u = await player();
      await limits.set(u, { dailyCents: 50_000n });
      const v = await limits.set(u, { dailyCents: 20_000n });
      expect(v.dailyCents).toBe(20_000n);
      expect(v.pending).toBeNull();
    });

    it('delays an increase by the cooling-off period', async () => {
      const u = await player();
      await limits.set(u, { dailyCents: 20_000n });
      const v = await limits.set(u, { dailyCents: 90_000n });

      expect(v.dailyCents).toBe(20_000n); // still protected
      expect(v.pending?.dailyCents).toBe(90_000n);
      const hours = (v.pending!.effectiveAt.getTime() - Date.now()) / 3600_000;
      expect(Math.round(hours)).toBe(COOLING_OFF_HOURS);
    });

    it('treats removing a limit as an increase (also delayed)', async () => {
      const u = await player();
      await limits.set(u, { dailyCents: 20_000n });
      const v = await limits.set(u, { dailyCents: null });
      expect(v.dailyCents).toBe(20_000n);
      expect(v.pending?.dailyCents).toBeNull();
    });

    it('promotes a due increase on the next read', async () => {
      const u = await player();
      await limits.set(u, { dailyCents: 20_000n });
      await limits.set(u, { dailyCents: 90_000n });
      // Cooling-off has passed.
      await prisma.playerLimit.update({
        where: { userId: u },
        data: { pendingEffectiveAt: new Date(Date.now() - 1000) },
      });

      const v = await limits.get(u);
      expect(v.dailyCents).toBe(90_000n);
      expect(v.pending).toBeNull();
    });

    it('a decrease still applies while an increase is pending', async () => {
      const u = await player();
      await limits.set(u, { dailyCents: 20_000n, weeklyCents: 100_000n });
      await limits.set(u, { dailyCents: 90_000n }); // pending
      const v = await limits.set(u, { weeklyCents: 50_000n }); // immediate

      expect(v.weeklyCents).toBe(50_000n);
      expect(v.dailyCents).toBe(20_000n);
      expect(v.pending?.dailyCents).toBe(90_000n);
      expect(v.pending?.weeklyCents).toBe(50_000n); // keeps the tightened value
    });

    it('rejects zero or negative limits', async () => {
      const u = await player();
      await expect(limits.set(u, { dailyCents: 0n })).rejects.toThrow(/maior que zero/);
      await expect(limits.set(u, { weeklyCents: -100n })).rejects.toThrow(/maior que zero/);
    });
  });

  describe('enforcing ceilings on deposits', () => {
    it('allows a deposit within the limit', async () => {
      const u = await player();
      await limits.set(u, { dailyCents: 50_000n });
      await expect(limits.assertDepositAllowed(u, 20_000n)).resolves.toBeUndefined();
    });

    it('counts money already received in the window', async () => {
      const u = await player();
      await limits.set(u, { dailyCents: 50_000n });
      await confirmedDeposit(u, 40_000);

      await expect(limits.assertDepositAllowed(u, 10_000n)).resolves.toBeUndefined();
      await expect(limits.assertDepositAllowed(u, 10_001n)).rejects.toThrow(
        /Limite diário de R\$ 500,00 atingido\. Disponível agora: R\$ 100,00/,
      );
    });

    it('ignores deposits older than the window', async () => {
      const u = await player();
      await limits.set(u, { dailyCents: 50_000n });
      await confirmedDeposit(u, 50_000, 25); // yesterday
      await expect(limits.assertDepositAllowed(u, 50_000n)).resolves.toBeUndefined();
    });

    it('ignores deposits that never arrived (pending / rejected)', async () => {
      const u = await player();
      await limits.set(u, { dailyCents: 50_000n });
      await prisma.deposit.create({ data: { userId: u, amountCents: 40_000n, status: 'REQUESTED' } });
      await prisma.paymentOrder.create({
        data: { orderNsu: `dep_${u}`, userId: u, amountCents: 40_000n, status: 'PENDING' },
      });
      await expect(limits.assertDepositAllowed(u, 50_000n)).resolves.toBeUndefined();
    });

    it('counts paid gateway orders too', async () => {
      const u = await player();
      await limits.set(u, { dailyCents: 50_000n });
      await prisma.paymentOrder.create({
        data: {
          orderNsu: `dep_paid_${u}`, userId: u, amountCents: 30_000n,
          status: 'PAID', purpose: 'DEPOSIT', paidAt: new Date(),
        },
      });
      await expect(limits.assertDepositAllowed(u, 20_001n)).rejects.toThrow(/Limite diário/);
    });

    it('enforces the weekly ceiling across several days', async () => {
      const u = await player();
      await limits.set(u, { weeklyCents: 100_000n });
      await confirmedDeposit(u, 60_000, 48);
      await confirmedDeposit(u, 30_000, 24);
      await expect(limits.assertDepositAllowed(u, 10_001n)).rejects.toThrow(/Limite semanal/);
      await expect(limits.assertDepositAllowed(u, 10_000n)).resolves.toBeUndefined();
    });

    it('the tightest window wins', async () => {
      const u = await player();
      await limits.set(u, { dailyCents: 10_000n, monthlyCents: 500_000n });
      await expect(limits.assertDepositAllowed(u, 20_000n)).rejects.toThrow(/Limite diário/);
    });
  });

  describe('self-exclusion', () => {
    it('blocks deposits while it lasts', async () => {
      const u = await player();
      await limits.selfExclude(u, 7);
      await expect(limits.assertDepositAllowed(u, 100n)).rejects.toThrow(/autoexclusão/i);
      expect(await limits.isSelfExcluded(u)).toBe(true);
    });

    it('expires on its own', async () => {
      const u = await player();
      await limits.selfExclude(u, 7);
      await prisma.playerLimit.update({
        where: { userId: u },
        data: { selfExcludedUntil: new Date(Date.now() - 1000) },
      });
      expect(await limits.isSelfExcluded(u)).toBe(false);
      await expect(limits.assertDepositAllowed(u, 100n)).resolves.toBeUndefined();
    });

    it('can be extended but never shortened', async () => {
      const u = await player();
      await limits.selfExclude(u, 30);
      await expect(limits.selfExclude(u, 7)).rejects.toThrow(/não é possível encurtá-lo/i);
      const v = await limits.selfExclude(u, 60);
      const days = Math.round((v.selfExcludedUntil!.getTime() - Date.now()) / 86_400_000);
      expect(days).toBe(60);
    });

    it('an indefinite break is far in the future', async () => {
      const u = await player();
      const v = await limits.selfExclude(u, null);
      expect(v.selfExcludedUntil!.getFullYear()).toBeGreaterThan(new Date().getFullYear() + 50);
      expect(v.selfExcluded).toBe(true);
    });

    it('rejects a nonsense period', async () => {
      const u = await player();
      await expect(limits.selfExclude(u, 0)).rejects.toThrow(/maior que zero/);
      await expect(limits.selfExclude(u, 1.5)).rejects.toThrow(/maior que zero/);
    });
  });
});
