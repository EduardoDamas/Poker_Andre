import { Subscription } from '../tournament/subscription';

/**
 * Referral codes. Agents have codes the admin creates (client, 2026-10-12);
 * every player also has one to invite friends (2026-10-14). A player types
 * either at sign-up.
 *
 * The code changes no price. In PAID tournaments a referred player — whoever
 * brought them — who holds a plan when the tournament starts gets a bigger
 * starting stack, by that plan (renewing or changing plan changes it; a lapsed
 * plan goes back to 1000). Free tournaments (promotions): 1000 for everyone.
 */

/** Normal starting stack — no code, or a code but no plan, or a free tournament. */
export const BASE_STACK = 1000;

const REFERRED_STACK: Record<Subscription, number> = {
  NONE: BASE_STACK,
  MONTHLY: 1500,
  QUARTERLY: 2000,
  SEMIANNUAL: 2500,
  ANNUAL: 3000,
};

/** Chips a player starts a paid tournament with, by their plan at the start. */
export function referralStartingStack(subscription: Subscription, referred: boolean): number {
  return referred ? REFERRED_STACK[subscription] : BASE_STACK;
}

/**
 * What a player earns for each friend they brought (client, 2026-10-14, fixed):
 * a share of the friend's FIRST subscription plus the same share of what the
 * friend paid for their FIRST paid tournament — by the plan of that first
 * subscription. No plan, no commission.
 */
export const MEMBER_COMMISSION_PCT: Record<Subscription, number> = {
  NONE: 0,
  MONTHLY: 5,
  QUARTERLY: 10,
  SEMIANNUAL: 15,
  ANNUAL: 20,
};

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
