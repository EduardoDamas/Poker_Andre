import {
  BASE_STACK,
  commissionCents,
  isValidReferralCode,
  MEMBER_COMMISSION_PCT,
  normalizeReferralCode,
  referralStartingStack,
  suggestReferralCode,
} from './referral';

describe('referral rules', () => {
  it('starting stack follows the client table: code + plan, else 1000', () => {
    expect(referralStartingStack('NONE', false)).toBe(1000);
    expect(referralStartingStack('ANNUAL', false)).toBe(1000); // plan but no code
    expect(referralStartingStack('NONE', true)).toBe(1000); // code but no plan
    expect(referralStartingStack('MONTHLY', true)).toBe(1500);
    expect(referralStartingStack('QUARTERLY', true)).toBe(2000);
    expect(referralStartingStack('SEMIANNUAL', true)).toBe(2500);
    expect(referralStartingStack('ANNUAL', true)).toBe(3000);
    expect(BASE_STACK).toBe(1000);
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

  it('member commission by the plan of the first subscription: 5/10/15/20%, none without a plan', () => {
    expect(MEMBER_COMMISSION_PCT).toEqual({ NONE: 0, MONTHLY: 5, QUARTERLY: 10, SEMIANNUAL: 15, ANNUAL: 20 });
  });

  it('commission rounds down and is blank with no percentage', () => {
    expect(commissionCents(12345n, 10)).toBe(1234n);
    expect(commissionCents(12345n, null)).toBeNull();
    expect(commissionCents(0n, 15)).toBe(0n);
  });
});
