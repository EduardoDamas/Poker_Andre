import { PrismaClient } from '@prisma/client';
import { LedgerService } from '../wallet/ledger.service';
import { WalletService } from '../wallet/wallet.service';
import { PrismaService } from '../prisma/prisma.service';
import { resetDb } from '../test-utils/reset-db';
import { PromoService } from './promo.service';

/**
 * Free-entry promotion, one company-funded prize (client spec, 2026-09-21):
 * R$250 to the winner, R$500 if the winner was a subscriber when it started.
 */
describe('PromoService (free-entry promotion, one prize)', () => {
  let prisma: PrismaClient;
  let ledger: LedgerService;
  let wallet: WalletService;
  let promo: PromoService;
  let counter = 0;

  const R250 = 25000n;
  const R500 = 50000n;

  beforeAll(() => {
    prisma = new PrismaClient();
    ledger = new LedgerService(prisma as unknown as PrismaService);
    wallet = new WalletService(prisma as unknown as PrismaService, ledger);
    promo = new PromoService(prisma as unknown as PrismaService, ledger, wallet);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await prisma.promoEvent.deleteMany();
    await prisma.tournamentWin.deleteMany();
  });

  async function player(data: Record<string, unknown> = {}): Promise<string> {
    counter += 1;
    const u = await prisma.user.create({
      data: {
        phone: `+5511900700${counter.toString().padStart(4, '0')}`,
        displayName: `P${counter}`,
        cpf: `9200000${counter.toString().padStart(4, '0')}`,
        birthDate: new Date('1990-01-01'),
        status: 'ACTIVE',
        ...data,
      },
    });
    return u.id;
  }

  const event = () =>
    promo.createEvent({
      name: 'Nível 0 — 07/10',
      startsAt: new Date('2026-10-07T22:00:00Z'),
      prizeCents: R250,
      prizeSubscriberCents: R500,
    });

  describe('paying the prize', () => {
    it('pays R$250 to a winner who was not a subscriber', async () => {
      const e = await event();
      const winner = await player();

      const payout = await promo.awardPrize({ eventId: e.id, winnerId: winner, subscribedAtStart: false });

      expect(payout.prizeCents).toBe(R250);
      expect(payout.paidNow).toBe(true);
      expect(await wallet.getBalance(winner)).toBe(R250);
    });

    it('pays R$500 to a winner who was a subscriber', async () => {
      const e = await event();
      const winner = await player();

      const payout = await promo.awardPrize({ eventId: e.id, winnerId: winner, subscribedAtStart: true });

      expect(payout.prizeCents).toBe(R500);
      expect(await wallet.getBalance(winner)).toBe(R500);
    });

    it('comes out of the promotions account, not the table earnings', async () => {
      const e = await event();
      await promo.awardPrize({ eventId: e.id, winnerId: await player(), subscribedAtStart: true });

      expect(await promo.totalSpentCents()).toBe(R500);
      const rake = await prisma.account.findFirst({ where: { type: 'HOUSE_RAKE' } });
      expect(rake ? await ledger.balanceOf(rake.id) : 0n).toBe(0n);
    });

    it('records the win for the winners feed and rankings', async () => {
      const e = await event();
      const winner = await player();
      await promo.awardPrize({ eventId: e.id, winnerId: winner, subscribedAtStart: false });

      const win = await prisma.tournamentWin.findFirst({ where: { userId: winner } });
      expect(win?.prizeCents).toBe(R250);
      expect(win?.level).toBe(0);
    });

    it('marks the event paid, with who won and how much', async () => {
      const e = await event();
      const winner = await player();
      await promo.awardPrize({ eventId: e.id, winnerId: winner, subscribedAtStart: true });

      const after = await prisma.promoEvent.findUniqueOrThrow({ where: { id: e.id } });
      expect(after).toMatchObject({
        status: 'PAID',
        winnerId: winner,
        winnerSubscribed: true,
        prizePaidCents: R500,
      });
      expect(after.paidAt).toBeInstanceOf(Date);
    });

    it('leaves the ledger balanced', async () => {
      const e = await event();
      await promo.awardPrize({ eventId: e.id, winnerId: await player(), subscribedAtStart: false });

      const all = await prisma.ledgerEntry.aggregate({ _sum: { amountCents: true } });
      expect(all._sum.amountCents ?? 0n).toBe(0n);
    });
  });

  describe('exactly one prize, never twice', () => {
    it('awarding again to the same winner pays nothing more', async () => {
      const e = await event();
      const winner = await player();

      await promo.awardPrize({ eventId: e.id, winnerId: winner, subscribedAtStart: false });
      const again = await promo.awardPrize({ eventId: e.id, winnerId: winner, subscribedAtStart: false });

      expect(again.paidNow).toBe(false);
      expect(await wallet.getBalance(winner)).toBe(R250);
      expect(await promo.totalSpentCents()).toBe(R250);
    });

    it('refuses a second, different winner', async () => {
      const e = await event();
      const first = await player();
      const second = await player();

      await promo.awardPrize({ eventId: e.id, winnerId: first, subscribedAtStart: false });
      await expect(
        promo.awardPrize({ eventId: e.id, winnerId: second, subscribedAtStart: true }),
      ).rejects.toThrow(/já foi pago a outro vencedor/);

      expect(await wallet.getBalance(second)).toBe(0n);
      expect(await promo.totalSpentCents()).toBe(R250);
    });

    it('two awards racing each other still pay once', async () => {
      const e = await event();
      const winner = await player();

      const results = await Promise.allSettled([
        promo.awardPrize({ eventId: e.id, winnerId: winner, subscribedAtStart: true }),
        promo.awardPrize({ eventId: e.id, winnerId: winner, subscribedAtStart: true }),
        promo.awardPrize({ eventId: e.id, winnerId: winner, subscribedAtStart: true }),
      ]);

      expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
      expect(await wallet.getBalance(winner)).toBe(R500);
      expect(await promo.totalSpentCents()).toBe(R500);
    });

    it('two different winners racing: one is paid, the other refused', async () => {
      const e = await event();
      const a = await player();
      const b = await player();

      const results = await Promise.allSettled([
        promo.awardPrize({ eventId: e.id, winnerId: a, subscribedAtStart: false }),
        promo.awardPrize({ eventId: e.id, winnerId: b, subscribedAtStart: false }),
      ]);

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
      expect(await promo.totalSpentCents()).toBe(R250);
    });

    it('each event has its own single prize', async () => {
      const e1 = await event();
      const e2 = await event();
      const winner = await player();

      await promo.awardPrize({ eventId: e1.id, winnerId: winner, subscribedAtStart: false });
      await promo.awardPrize({ eventId: e2.id, winnerId: winner, subscribedAtStart: false });

      expect(await wallet.getBalance(winner)).toBe(R250 * 2n);
    });
  });

  describe('refusals', () => {
    it('holds the prize when the winner is blocked', async () => {
      const e = await event();
      const winner = await player({ status: 'BLOCKED', blockReason: 'fraude' });

      await expect(
        promo.awardPrize({ eventId: e.id, winnerId: winner, subscribedAtStart: false }),
      ).rejects.toThrow(/bloqueada/);
      expect(await wallet.getBalance(winner)).toBe(0n);
      const after = await prisma.promoEvent.findUniqueOrThrow({ where: { id: e.id } });
      expect(after.status).toBe('SCHEDULED'); // still payable once resolved
    });

    it('pays nothing for a cancelled event', async () => {
      const e = await event();
      await promo.cancel(e.id);
      await expect(
        promo.awardPrize({ eventId: e.id, winnerId: await player(), subscribedAtStart: false }),
      ).rejects.toThrow(/cancelada/);
      expect(await promo.totalSpentCents()).toBe(0n);
    });

    it('cannot cancel an event that already paid', async () => {
      const e = await event();
      await promo.awardPrize({ eventId: e.id, winnerId: await player(), subscribedAtStart: false });
      await expect(promo.cancel(e.id)).rejects.toThrow(/já foi pago/);
    });

    it('rejects nonsense prize settings', async () => {
      const base = { name: 'X', startsAt: new Date() };
      await expect(promo.createEvent({ ...base, prizeCents: 0n, prizeSubscriberCents: R500 }))
        .rejects.toThrow(/maiores que zero/);
      await expect(promo.createEvent({ ...base, prizeCents: R500, prizeSubscriberCents: R250 }))
        .rejects.toThrow(/não pode ser menor/);
      await expect(promo.createEvent({ ...base, name: '  ', prizeCents: R250, prizeSubscriberCents: R500 }))
        .rejects.toThrow(/nome/);
    });
  });

  describe('who counts as a subscriber', () => {
    it('an active plan counts', async () => {
      const id = await player({
        subscription: 'MONTHLY',
        subscriptionUntil: new Date(Date.now() + 10 * 86_400_000),
      });
      expect(await promo.isSubscribedNow(id)).toBe(true);
    });

    it('an expired plan does not', async () => {
      const id = await player({
        subscription: 'ANNUAL',
        subscriptionUntil: new Date(Date.now() - 86_400_000),
      });
      expect(await promo.isSubscribedNow(id)).toBe(false);
    });

    it('no plan does not', async () => {
      expect(await promo.isSubscribedNow(await player())).toBe(false);
    });

    it('any plan counts, from monthly to annual', async () => {
      for (const plan of ['MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL'] as const) {
        const id = await player({ subscription: plan, subscriptionUntil: null });
        expect(await promo.isSubscribedNow(id)).toBe(true);
      }
    });
  });
});
