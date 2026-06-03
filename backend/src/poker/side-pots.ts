/**
 * Side-pot construction.
 *
 * When players are all-in for different amounts, the chips split into a main pot
 * plus side pots. Each pot can only be won by players who contributed to it and
 * are still live (not folded). Folded players' chips stay in the pots they paid
 * into — they just can't win them.
 *
 * Uncalled bets are refunded: if a single player contributed strictly more than
 * everyone else (e.g. they bet 100 and the only caller was all-in for 60), the
 * uncalled excess is returned to them rather than forming an unwinnable pot.
 *
 * Built from the per-player total contributions produced by the betting rounds.
 * Invariant: Σ pot amounts + Σ refunds == Σ contributions (chips conserved).
 */

export interface Pot {
  amount: number;
  /** Players eligible to win this pot (contributed to it and not folded). */
  eligiblePlayerIds: string[];
}

export interface SidePotResult {
  pots: Pot[];
  /** Uncalled amounts returned to their contributor, by player id. */
  refunds: Record<string, number>;
}

function sameMembers(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = new Set(a);
  return b.every((id) => sa.has(id));
}

export function buildSidePots(
  contributions: Record<string, number>,
  foldedIds: Iterable<string> = [],
): SidePotResult {
  const folded = new Set(foldedIds);
  const effective: Record<string, number> = {};
  for (const [id, c] of Object.entries(contributions)) {
    if (c > 0) effective[id] = c;
  }

  const refunds: Record<string, number> = {};
  const ids = Object.keys(effective);
  if (ids.length === 0) return { pots: [], refunds };

  // Refund an uncalled bet: a unique strict maximum is capped to the
  // second-highest contribution; the excess goes back to that player.
  const amounts = ids.map((id) => effective[id]).sort((a, b) => b - a);
  const top = amounts[0];
  const second = amounts[1] ?? 0;
  const topHolders = ids.filter((id) => effective[id] === top);
  if (topHolders.length === 1 && top > second) {
    const id = topHolders[0];
    refunds[id] = top - second;
    effective[id] = second;
  }

  const entries = Object.entries(effective).filter(([, c]) => c > 0);
  const levels = [...new Set(entries.map(([, c]) => c))].sort((a, b) => a - b);

  const layers: Pot[] = [];
  let prev = 0;
  for (const level of levels) {
    const contributors = entries.filter(([, c]) => c >= level).map(([id]) => id);
    const amount = (level - prev) * contributors.length;
    const eligible = contributors.filter((id) => !folded.has(id));
    layers.push({ amount, eligiblePlayerIds: eligible });
    prev = level;
  }

  // Merge adjacent layers that share the same eligible set.
  const pots: Pot[] = [];
  for (const layer of layers) {
    const last = pots[pots.length - 1];
    if (last && sameMembers(last.eligiblePlayerIds, layer.eligiblePlayerIds)) {
      last.amount += layer.amount;
    } else {
      pots.push({ amount: layer.amount, eligiblePlayerIds: [...layer.eligiblePlayerIds] });
    }
  }

  return { pots: pots.filter((p) => p.amount > 0), refunds };
}

/** Convenience: total chips across all pots. */
export function totalPot(pots: Pot[]): number {
  return pots.reduce((sum, p) => sum + p.amount, 0);
}
