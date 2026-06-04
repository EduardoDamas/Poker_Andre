import { Card } from '../poker/deck';
import { evaluate } from '../poker/hand-evaluator';

/**
 * Server-side robot decision — basic, rule-following play: check when free,
 * call with a decent hand, fold the weakest. (No raises: keeps online robot
 * matches simple and always-progressing. "Basic gameplay behaviour.")
 */
export function decideRobotAction(
  hole: Card[],
  board: Card[],
  legal: string[],
): { type: string; amount?: number } {
  const strength =
    board.length > 0
      ? (evaluate([...hole, ...board]).category + 1) / 10 // ~0.2..1
      : preflopStrength(hole);

  if (legal.includes('check')) return { type: 'check' };
  if (legal.includes('call')) {
    return strength > 0.3 ? { type: 'call' } : { type: 'fold' };
  }
  return { type: legal[0] ?? 'fold' };
}

function preflopStrength(hole: Card[]): number {
  const order = 'AKQJT98765432';
  const a = 13 - order.indexOf(hole[0][0]);
  const b = 13 - order.indexOf(hole[1][0]);
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  let s = (hi / 13) * 0.45 + (lo / 13) * 0.3;
  if (hole[0][0] === hole[1][0]) s += 0.35; // pair
  if (hole[0][1] === hole[1][1]) s += 0.07; // suited
  return Math.min(1, s);
}
