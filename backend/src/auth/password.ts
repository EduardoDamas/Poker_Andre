import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

/**
 * Password hashing with Node's built-in scrypt — no external dependency, builds
 * cleanly in the slim Docker image. Stored form is "salt:derivedKey" (both hex).
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

/** Constant-time verify against a stored "salt:derivedKey". */
export function verifyPassword(password: string, stored: string): boolean {
  const [salt, key] = stored.split(':');
  if (!salt || !key) return false;
  const derived = scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(key, 'hex');
  return keyBuf.length === derived.length && timingSafeEqual(keyBuf, derived);
}
