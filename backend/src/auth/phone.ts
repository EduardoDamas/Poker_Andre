/**
 * Normalize a (Brazilian) phone number to E.164 so formatting variants of the
 * same number — "+55 11 99999-8888", "5511999998888", "(11) 99999-8888" — all
 * map to ONE canonical string. The User.phone column is unique; without this,
 * the same phone could register several accounts just by changing punctuation.
 */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  // Already has a country code (either "+…" or 55 + DDD + 8/9-digit number).
  if (raw.trim().startsWith('+')) return `+${digits}`;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) {
    return `+${digits}`;
  }
  // Bare DDD + number → assume Brazil.
  if (digits.length === 10 || digits.length === 11) return `+55${digits}`;
  return `+${digits}`;
}
