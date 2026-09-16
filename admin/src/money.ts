/// Format integer cents (as a string from the API) as Brazilian currency,
/// with thousands separators — R$ 1.500,00, not R$ 1500,00.
export function formatBRL(cents: string | number): string {
  const n = typeof cents === 'string' ? Number(cents) : cents;
  if (!Number.isFinite(n)) return 'R$ —';
  return `R$ ${(n / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
