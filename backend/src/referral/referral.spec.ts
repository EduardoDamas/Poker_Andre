import {
  BASE_PROMO_STACK,
  commissionCents,
  isValidReferralCode,
  normalizeReferralCode,
  promoStartingStack,
  suggestReferralCode,
} from './referral';

describe('referral rules', () => {
  it('starting stack follows the client table: code + plan, else 1000', () => {
    expect(promoStartingStack('NONE', false)).toBe(1000);
    expect(promoStartingStack('ANNUAL', false)).toBe(1000); // plan but no code
    expect(promoStartingStack('NONE', true)).toBe(1000); // code but no plan
    expect(promoStartingStack('MONTHLY', true)).toBe(1500);
    expect(promoStartingStack('QUARTERLY', true)).toBe(2000);
    expect(promoStartingStack('SEMIANNUAL', true)).toBe(2500);
    expect(promoStartingStack('ANNUAL', true)).toBe(3000);
    expect(BASE_PROMO_STACK).toBe(1000);
  });

  it('normalizes and validates typed codes', () => {
    expect(normalizeReferralCode(' joao 10 ')).toBe('JOAO10');
    expect(isValidReferralCode('JOAO10')).toBe(true);
    expect(isValidReferralCode('AB')).toBe(false);
    expect(isValidReferralCode('JOÃO')).toBe(false);
    expect(isValidReferralCode('A'.repeat(21))).toBe(false);
  });

  it('suggests a code from the first name, accents dropped', () => {
    expect(suggestReferralCode('João Silva', 47)).toBe('JOAO47');
    expect(suggestReferralCode('Maximiliano Souza', 5)).toBe('MAXIMILI05');
    expect(suggestReferralCode('  ', 12)).toBe('AGENTE12');
    expect(isValidReferralCode(suggestReferralCode('Zé', 3))).toBe(true);
  });

  it('commission rounds down and is blank with no percentage', () => {
    expect(commissionCents(12345n, 10)).toBe(1234n);
    expect(commissionCents(12345n, null)).toBeNull();
    expect(commissionCents(0n, 15)).toBe(0n);
  });
});
