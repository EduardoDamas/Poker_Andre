/**
 * Subscription tiers and the entry-fee / prize-share tables they drive.
 *
 * Source of truth: docs/PRIZE_RULES.md §5 (entry fee by level × subscription)
 * and §6 (prize-share % by subscription), both confirmed from CAPACONTEST.pdf.
 *
 * NOTE: subscription *purchase prices* (monthly/quarterly/...) are NOT yet known
 * (PRIZE_RULES §8 "still to obtain") — only the discounts they grant are. The
 * purchase flow therefore reads prices from config (SUBSCRIPTION_PRICES) and is
 * left disabled until the client provides them.
 *
 * All money is integer cents.
 */

export type Subscription = 'NONE' | 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL';

export const SUBSCRIPTIONS: Subscription[] = [
  'NONE',
  'MONTHLY',
  'QUARTERLY',
  'SEMIANNUAL',
  'ANNUAL',
];

// §5 — Entry fee (V.I.) in BRL by Poker room level (1..7) × subscription.
// Column order: NONE, MONTHLY, QUARTERLY, SEMIANNUAL, ANNUAL.
const ENTRY_FEE_BRL: Record<number, Record<Subscription, number>> = {
  1: { NONE: 20, MONTHLY: 17, QUARTERLY: 15, SEMIANNUAL: 12, ANNUAL: 10 },
  2: { NONE: 40, MONTHLY: 34, QUARTERLY: 30, SEMIANNUAL: 24, ANNUAL: 20 },
  3: { NONE: 100, MONTHLY: 85, QUARTERLY: 75, SEMIANNUAL: 55, ANNUAL: 50 },
  4: { NONE: 200, MONTHLY: 170, QUARTERLY: 150, SEMIANNUAL: 120, ANNUAL: 100 },
  5: { NONE: 1000, MONTHLY: 850, QUARTERLY: 750, SEMIANNUAL: 600, ANNUAL: 500 },
  6: { NONE: 2000, MONTHLY: 1700, QUARTERLY: 1500, SEMIANNUAL: 1200, ANNUAL: 1000 },
  7: { NONE: 10000, MONTHLY: 8500, QUARTERLY: 7500, SEMIANNUAL: 6000, ANNUAL: 5000 },
};

// §6 — Fraction of the prize pool a player is entitled to, by subscription.
// Expressed as integer percent to avoid floats; applied as (prize * pct) / 100.
const PRIZE_SHARE_PCT: Record<Subscription, number> = {
  NONE: 25,
  MONTHLY: 30,
  QUARTERLY: 50,
  SEMIANNUAL: 75,
  ANNUAL: 100,
};

/** Entry fee (V.I.) in integer cents for a room level and subscription tier. */
export function entryFeeCents(level: number, sub: Subscription): bigint {
  const row = ENTRY_FEE_BRL[level];
  if (!row) throw new Error(`Unknown room level: ${level}`);
  return BigInt(row[sub]) * 100n;
}

/** Prize-share percent (integer) for a subscription tier. */
export function prizeSharePct(sub: Subscription): number {
  return PRIZE_SHARE_PCT[sub];
}

/**
 * The share of a prize pool a player of [sub] actually receives, in cents.
 * The remainder (pool − share) stays with the house.
 */
export function prizeShareCents(prizePoolCents: bigint, sub: Subscription): bigint {
  return (prizePoolCents * BigInt(prizeSharePct(sub))) / 100n;
}
