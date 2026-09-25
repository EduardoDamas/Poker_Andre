/**
 * How a promotion is described to players — in the lobby, on the download page
 * and in refusals — in Brasília time, whatever the server's clock zone.
 */

const TZ = 'America/Sao_Paulo';

function parts(d: Date, opts: Intl.DateTimeFormatOptions): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, ...opts }).formatToParts(d)) {
    out[p.type] = p.value;
  }
  return out;
}

/** "19:30" */
export function promoTime(d: Date): string {
  const p = parts(d, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  return `${p.hour}:${p.minute}`;
}

/** "qua 07/10 19:30" — short, for a lobby room name. */
export function promoWhen(d: Date): string {
  const p = parts(d, { weekday: 'short', day: '2-digit', month: '2-digit' });
  return `${p.weekday.replace('.', '')} ${p.day}/${p.month} ${promoTime(d)}`;
}

/** "quarta-feira, 07/10 às 19:30" — for sentences. */
export function promoWhenLong(d: Date): string {
  const p = parts(d, { weekday: 'long', day: '2-digit', month: '2-digit' });
  return `${p.weekday}, ${p.day}/${p.month} às ${promoTime(d)}`;
}

/** "R$ 1.500,00" */
export function brl(cents: bigint): string {
  return `R$ ${(Number(cents) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * The prize, stated exactly as it is paid: one amount when both are equal,
 * otherwise the subscriber condition spelled out — never a bare "R$ 500" that a
 * non-subscriber champion would not receive.
 */
export function promoPrizeLine(event: { prizeCents: bigint; prizeSubscriberCents: bigint }): string {
  if (event.prizeSubscriberCents === event.prizeCents) return `Prêmio de ${brl(event.prizeCents)} para o campeão`;
  return (
    `Prêmio de ${brl(event.prizeSubscriberCents)} para o campeão assinante ` +
    `(assinatura ativa até o início do torneio) ou ${brl(event.prizeCents)} para quem não é assinante`
  );
}
