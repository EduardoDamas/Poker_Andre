import { brl, promoPrizeLine, promoTime, promoWhen, promoWhenLong } from './promo-format';

/** How a promotion is described to players: Brasília time, the prize as paid. */
describe('promo-format', () => {
  const start = new Date('2026-10-07T22:30:00Z'); // 19:30 in Brasília

  it('speaks Brasília time, whatever the server zone', () => {
    expect(promoTime(start)).toBe('19:30');
    expect(promoWhen(start)).toBe('qua 07/10 19:30');
    expect(promoWhenLong(start)).toBe('quarta-feira, 07/10 às 19:30');
    expect(promoTime(new Date('2026-10-07T22:00:00Z'))).toBe('19:00');
  });

  it('formats money the Brazilian way', () => {
    expect(brl(25000n)).toBe('R$ 250,00');
    expect(brl(150000n)).toBe('R$ 1.500,00');
  });

  it('states the prize exactly as it is paid', () => {
    expect(promoPrizeLine({ prizeCents: 50000n, prizeSubscriberCents: 50000n }))
      .toBe('Prêmio de R$ 500,00 para o campeão');
    const split = promoPrizeLine({ prizeCents: 25000n, prizeSubscriberCents: 50000n });
    expect(split).toContain('R$ 500,00 para o campeão assinante');
    expect(split).toContain('até o início do torneio');
    expect(split).toContain('R$ 250,00 para quem não é assinante');
  });
});
