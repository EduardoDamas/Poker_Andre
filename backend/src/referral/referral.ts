import { Subscription } from '../tournament/subscription';

/**
 * Referral codes (client, 2026-10-12): each agent has a code; a player types it
 * at sign-up so the admin knows which agent brought them.
 *
 * The code itself changes no price. In promotions, a referred player who holds
 * a plan when the tournament starts gets a bigger starting stack; with no plan
 * (or no code) it is the normal 1000.
 */

/** Normal promotion starting stack — no code, or a code but no plan. */
export const BASE_PROMO_STACK = 1000;

const REFERRED_STACK: Record<Subscription, number> = {
  NONE: BASE_PROMO_STACK,
  MONTHLY: 1500,
  QUARTERLY: 2000,
  SEMIANNUAL: 2500,
  ANNUAL: 3000,
};

/** Chips a player starts a promotion table with, by their plan at the start. */
export function promoStartingStack(subscription: Subscription, referred: boolean): number {
  return referred ? REFERRED_STACK[subscription] : BASE_PROMO_STACK;
}

/**
 * Canonical form of a typed code: trimmed, upper-case, spaces dropped. So
 * " joao 10 " and "JOAO10" are the same code.
 */
export function normalizeReferralCode(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase();
}

/** 3–20 letters/digits, after normalizing. */
export function isValidReferralCode(code: string): boolean {
  return /^[A-Z0-9]{3,20}$/.test(code);
}

/**
 * A code suggested from the agent's name when the admin leaves it blank: the
 * first name without accents, up to 8 letters, plus 2 digits — "João Silva" →
 * "JOAO47".
 */
export function suggestReferralCode(name: string, digits: number): string {
  const first = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, '')
    .trim()
    .split(/\s+/)[0]
    ?.slice(0, 8);
  const stem = first && first.length >= 1 ? first : 'AGENTE';
  return `${stem}${String(digits % 100).padStart(2, '0')}`;
}

/** Commission in cents, rounded down; null while no percentage is set. */
export function commissionCents(baseCents: bigint, pct: number | null): bigint | null {
  if (pct === null) return null;
  return (baseCents * BigInt(pct)) / 100n;
}
