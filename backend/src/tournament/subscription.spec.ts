import {
  entryFeeCents,
  prizeSharePct,
  prizeShareCents,
  subscriptionPriceCents,
  SUBSCRIPTIONS,
} from './subscription';

describe('subscription tables (CAPACONTEST §5/§6)', () => {
  it('entry fee in cents matches the PDF table', () => {
    expect(entryFeeCents(1, 'NONE')).toBe(2000n); // R$20
    expect(entryFeeCents(1, 'ANNUAL')).toBe(1000n); // R$10
    expect(entryFeeCents(7, 'NONE')).toBe(1_000_000n); // R$10000
    expect(entryFeeCents(7, 'ANNUAL')).toBe(500_000n); // R$5000
    expect(entryFeeCents(4, 'QUARTERLY')).toBe(15_000n); // R$150
  });

  it('throws on an unknown level', () => {
    expect(() => entryFeeCents(8, 'NONE')).toThrow();
  });

  it('prize-share percent matches the PDF table', () => {
    expect(prizeSharePct('NONE')).toBe(25);
    expect(prizeSharePct('MONTHLY')).toBe(30);
    expect(prizeSharePct('QUARTERLY')).toBe(50);
    expect(prizeSharePct('SEMIANNUAL')).toBe(75);
    expect(prizeSharePct('ANNUAL')).toBe(100);
  });

  it('prize share in cents floors to integer', () => {
    expect(prizeShareCents(40000n, 'NONE')).toBe(10000n); // 25% of 400
    expect(prizeShareCents(40000n, 'ANNUAL')).toBe(40000n); // 100%
    expect(prizeShareCents(101n, 'NONE')).toBe(25n); // 25.25 → 25 (floor)
  });

  it('subscription purchase prices match the client-confirmed table', () => {
    expect(subscriptionPriceCents('MONTHLY')).toBe(20_000n); // R$200
    expect(subscriptionPriceCents('QUARTERLY')).toBe(50_000n); // R$500
    expect(subscriptionPriceCents('SEMIANNUAL')).toBe(90_000n); // R$900
    expect(subscriptionPriceCents('ANNUAL')).toBe(120_000n); // R$1200
    expect(subscriptionPriceCents('NONE')).toBe(0n); // free tier
  });

  it('covers every subscription tier', () => {
    for (const s of SUBSCRIPTIONS) {
      expect(prizeSharePct(s)).toBeGreaterThan(0);
      expect(entryFeeCents(1, s)).toBeGreaterThan(0n);
    }
  });
});
