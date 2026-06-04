import { User } from '@prisma/client';

/**
 * True if the user is currently blocked. A temporary block (blockedUntil in the
 * future) counts as blocked; an expired temp block does not (auto-unblock at
 * read time). A permanent block has status BLOCKED and blockedUntil = null.
 */
export function isBlocked(
  user: Pick<User, 'status' | 'blockedUntil'>,
  now: Date = new Date(),
): boolean {
  if (user.status !== 'BLOCKED') return false;
  if (user.blockedUntil == null) return true; // permanent
  return user.blockedUntil.getTime() > now.getTime(); // temp, still active
}
