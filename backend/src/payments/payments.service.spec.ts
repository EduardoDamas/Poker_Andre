import { NotFoundException } from '@nestjs/common';
import { PaymentsService } from './payments.service';

describe('PaymentsService', () => {
  const svc = new PaymentsService();

  describe('tournamentEntry', () => {
    it('returns the link + amount for a valid combination', () => {
      expect(svc.tournamentEntry(3, false, 'pix')).toMatchObject({
        level: 3,
        subscriber: false,
        method: 'pix',
        amountCents: 10000, // R$100
      });
      expect(svc.tournamentEntry(1, true, 'card').amountCents).toBe(1250); // R$12,50
      expect(svc.tournamentEntry(6, true, 'pix').amountCents).toBe(100000); // R$1000
      expect(svc.tournamentEntry(7, false, 'pix').amountCents).toBe(1000000); // R$10000
    });

    it('every returned link is an InfinitePay checkout URL', () => {
      const link = svc.tournamentEntry(5, true, 'card');
      expect(link.url).toMatch(/^https:\/\/link\.infinitepay\.io\//);
    });

    it('throws 404 for an unconfigured combination', () => {
      expect(() => svc.tournamentEntry(99, false, 'pix')).toThrow(NotFoundException);
    });
  });

  describe('allTournamentEntries', () => {
    it('returns the full 28-link entry table', () => {
      const all = svc.allTournamentEntries();
      expect(all).toHaveLength(28); // 7 levels × assinante/não × Pix/card
      expect(all.every((l) => /^https:\/\/link\.infinitepay\.io\//.test(l.url))).toBe(true);
    });
  });

  describe('subscriptionPlans', () => {
    it('lists the 4 paid plans with prices, excluding NONE', () => {
      const plans = svc.subscriptionPlans();
      expect(plans.map((p) => p.plan)).toEqual(['MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL']);
      const byPlan = Object.fromEntries(plans.map((p) => [p.plan, p.priceCents]));
      expect(byPlan.MONTHLY).toBe('20000'); // R$200
      expect(byPlan.QUARTERLY).toBe('50000'); // R$500
      expect(byPlan.SEMIANNUAL).toBe('90000'); // R$900
      expect(byPlan.ANNUAL).toBe('120000'); // R$1200
    });
  });
});
