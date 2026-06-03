/**
 * Age / minimum-age check for registration.
 *
 * Real-money gaming is 18+ in Brazil — minors must be blocked at registration.
 * `now` is injected (not read from the clock) so the rule is deterministic and
 * unit-testable, and so the server's timezone can't shift a birthday by a day.
 */

/** Whole years completed from `birthDate` to `now` (calendar-correct). */
export function ageInYears(birthDate: Date, now: Date): number {
  let age = now.getUTCFullYear() - birthDate.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - birthDate.getUTCMonth();
  const dayDiff = now.getUTCDate() - birthDate.getUTCDate();
  // Birthday hasn't occurred yet this year → subtract one.
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1;
  }
  return age;
}

/**
 * True if the person is at least `minAge` (default 18) as of `now`.
 * Turning 18 *today* counts as an adult; one day before does not.
 * Rejects invalid/future birth dates.
 */
export function isAdult(birthDate: Date, now: Date, minAge = 18): boolean {
  if (!(birthDate instanceof Date) || isNaN(birthDate.getTime())) return false;
  if (birthDate.getTime() > now.getTime()) return false; // born in the future
  return ageInYears(birthDate, now) >= minAge;
}
