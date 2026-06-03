/// Format integer cents (as a string from the API) as Brazilian currency.
export function formatBRL(cents: string | number): string {
  const n = typeof cents === 'string' ? Number(cents) : cents;
  return `R$ ${(n / 100).toFixed(2).replace('.', ',')}`;
}
