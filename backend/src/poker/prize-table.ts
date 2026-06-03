/**
 * Prize calculation by room occupancy (per CAPACONTEST.pdf).
 *
 * The document defines the cash prize as a multiple of the entry value (V.I. =
 * "valor de inscrição"), scaling with how full the room is — from 20×V.I. (nearly
 * empty) up to 200×V.I. (full). The house keeps the difference between what was
 * collected and the prize paid.
 *
 * ⚠️ PLACEHOLDER TIERS: the exact occupancy→multiplier breakpoints must be taken
 * from CAPACONTEST.pdf. `DEFAULT_PRIZE_TIERS` below is a reasonable monotonic
 * placeholder spanning 20×→200×; swap in the real rows once available. The MATH
 * and INVARIANTS here (money-safety, conservation) are final regardless.
 *
 * All money is integer cents (bigint). Occupancy/multipliers are plain numbers.
 */

export interface PrizeTier {
  /** Minimum occupancy fraction [0,1] at which this multiplier applies. */
  minOccupancy: number;
  /** Prize = multiplier × entry value (V.I.). */
  multiplier: number;
}

// Placeholder 7-band schedule (20× → 200×). Replace with the PDF's exact table.
export const DEFAULT_PRIZE_TIERS: PrizeTier[] = [
  { minOccupancy: 0.0, multiplier: 20 },
  { minOccupancy: 0.2, multiplier: 50 },
  { minOccupancy: 0.4, multiplier: 80 },
  { minOccupancy: 0.55, multiplier: 110 },
  { minOccupancy: 0.7, multiplier: 140 },
  { minOccupancy: 0.85, multiplier: 170 },
  { minOccupancy: 1.0, multiplier: 200 },
];

/** The prize multiplier for a given occupancy fraction. */
export function multiplierFor(occupancy: number, tiers: PrizeTier[] = DEFAULT_PRIZE_TIERS): number {
  const sorted = [...tiers].sort((a, b) => a.minOccupancy - b.minOccupancy);
  let multiplier = sorted[0]?.multiplier ?? 0;
  for (const tier of sorted) {
    if (occupancy >= tier.minOccupancy) multiplier = tier.multiplier;
    else break;
  }
  return multiplier;
}

export interface PrizePool {
  occupancy: number;
  multiplier: number;
  collectedCents: bigint;
  prizeCents: bigint;
  rakeCents: bigint;
}

/**
 * Compute the prize pool for a room.
 *
 * MONEY-SAFETY: the prize can never exceed what was collected (entries ×
 * participants). At very low occupancy the 20×V.I. floor could in theory exceed
 * the pot, so the prize is capped at the collected amount.
 */
export function computePrizePool(params: {
  entryValueCents: bigint;
  capacity: number;
  participants: number;
  tiers?: PrizeTier[];
}): PrizePool {
  const { entryValueCents, capacity, participants } = params;
  if (capacity <= 0) throw new Error('capacity must be positive.');
  if (participants < 0 || participants > capacity) {
    throw new Error('participants must be within [0, capacity].');
  }
  if (entryValueCents < 0n) throw new Error('entry value cannot be negative.');

  const occupancy = participants / capacity;
  const multiplier = multiplierFor(occupancy, params.tiers);
  const collectedCents = entryValueCents * BigInt(participants);
  const prizeRaw = entryValueCents * BigInt(multiplier);
  const prizeCents = prizeRaw < collectedCents ? prizeRaw : collectedCents; // never overpay
  const rakeCents = collectedCents - prizeCents;

  return { occupancy, multiplier, collectedCents, prizeCents, rakeCents };
}

/**
 * Split a prize among finishing places by integer weights (e.g. [70,20,10]).
 * Returns integer-cent shares summing exactly to the prize; any remainder cents
 * go to the earliest places (1st, then 2nd, ...).
 */
export function distributePrize(prizeCents: bigint, weights: number[]): bigint[] {
  if (weights.length === 0) throw new Error('Need at least one place.');
  if (weights.some((w) => w <= 0)) throw new Error('Weights must be positive.');

  const total = BigInt(weights.reduce((a, b) => a + b, 0));
  const shares = weights.map((w) => (prizeCents * BigInt(w)) / total);
  let distributed = shares.reduce((a, b) => a + b, 0n);
  let remainder = prizeCents - distributed;

  // Hand out leftover cents one at a time, top place first.
  for (let i = 0; remainder > 0n && i < shares.length; i++) {
    shares[i] += 1n;
    remainder -= 1n;
  }
  return shares;
}
