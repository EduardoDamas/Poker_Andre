/**
 * Brazilian CPF validation (Cadastro de Pessoas Físicas).
 *
 * A CPF is 11 digits: 9 base digits + 2 check digits computed mod 11.
 * Registration must reject invalid CPFs so money never attaches to a fake identity.
 */

/** Strip formatting (dots, dash, spaces) and return digits only. */
export function normalizeCpf(input: string): string {
  return (input ?? '').replace(/\D/g, '');
}

/** Compute one CPF check digit over the given base digits. */
function checkDigit(digits: number[]): number {
  // Weights run from (len+1) down to 2.
  const weightStart = digits.length + 1;
  const sum = digits.reduce((acc, d, i) => acc + d * (weightStart - i), 0);
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

/**
 * Returns true if `input` is a structurally valid CPF.
 * Accepts formatted ("111.444.777-35") or raw ("11144477735") input.
 * Rejects: wrong length, non-numeric, repeated-digit sequences (e.g. 111.111.111-11),
 * and any CPF whose check digits don't match.
 */
export function isValidCpf(input: string): boolean {
  const cpf = normalizeCpf(input);

  if (cpf.length !== 11) return false;
  // All-equal digits pass the math but are not valid CPFs.
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  const digits = cpf.split('').map(Number);
  const d1 = checkDigit(digits.slice(0, 9));
  if (d1 !== digits[9]) return false;

  const d2 = checkDigit(digits.slice(0, 10));
  if (d2 !== digits[10]) return false;

  return true;
}

/** Format raw digits as 000.000.000-00 (for display); returns input if not 11 digits. */
export function formatCpf(input: string): string {
  const cpf = normalizeCpf(input);
  if (cpf.length !== 11) return input;
  return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
}
