/**
 * InfinitePay static checkout links for tournament INITIAL ENTRY ("taxa de
 * participação"). Sent by the client (André) on 2026-07-31 / 08-01.
 *
 * ── MODEL (clarified with the client 2026-08-01) ──
 *  - Initial entry varies by LEVEL (1–7) × SUBSCRIBER (assinante / não) × METHOD
 *    (Pix / Cartão). Card = Pix × 1.25. Não-assinante Pix = base fee; assinante
 *    Pix = 50% of it. Values match the código NONE / ANNUAL table across all levels.
 *  - A subscription PLAN never changes the entry price — only "assinante" vs "não
 *    assinante" matters. The plan only changes the PRIZE SHARE the winner receives
 *    (25/30/50/75/100%), which stays in subscription.ts.
 *  - RE-ENTRY ("perdedor continuar", etapa 1–4 = 25/50/75/100% of the entry) is
 *    the SAME price for Pix or Cartão (method-independent). Per the agreed plan,
 *    re-entries are NOT static links — they'll be generated on the fly via the
 *    InfinitePay API. The store TEST uses INITIAL ENTRY only (this table).
 *
 * ── STATUS ──
 *  - Initial-entry set COMPLETE (28/28 links) as of 2026-08-01. Prices are
 *    consistent across levels 1–7 (não-assinante Pix = base, assinante = 50%,
 *    card = Pix × 1.25) and match the código NONE/ANNUAL fees.
 *  - The L6 assinante-Cartão link (R$1250) was labeled "não assinante" by the
 *    client, but R$1250 can only be assinante-Cartão — treated as such (confirm).
 *  - NEXT: align subscription.ts entry table to this binary (assinante/não) ×
 *    level × method model, and wire entry to the InfinitePay API/webhook.
 */

export type PaymentMethod = 'pix' | 'card';

export interface TournamentEntryLink {
  level: number; // room level 1–7
  subscriber: boolean; // true = assinante, false = não assinante
  method: PaymentMethod;
  amountCents: number;
  url: string;
}

export const TOURNAMENT_ENTRY_LINKS: TournamentEntryLink[] = [
  // ── Nível 1 ──
  { level: 1, subscriber: false, method: 'pix', amountCents: 2000, url: 'https://link.infinitepay.io/andre-luiz-g4j/VC1DLUMtUg-hPSsmJhZGa-20,00' },
  { level: 1, subscriber: false, method: 'card', amountCents: 2500, url: 'https://link.infinitepay.io/andre-luiz-g4j/VC1DLUMtUg-6DHqaOlaWn-25,00' },
  { level: 1, subscriber: true, method: 'pix', amountCents: 1000, url: 'https://link.infinitepay.io/andre-luiz-g4j/VC1BLUEtUg-LGx2vdbMRp-10,00' },
  { level: 1, subscriber: true, method: 'card', amountCents: 1250, url: 'https://link.infinitepay.io/andre-luiz-g4j/VC1DLUEtUg-fAJ4f6DAQh-12,50' },

  // ── Nível 2 ──
  { level: 2, subscriber: false, method: 'pix', amountCents: 4000, url: 'https://link.infinitepay.io/andre-luiz-g4j/VC1DLUMtUg-Navh2a05CX-40,00' },
  { level: 2, subscriber: false, method: 'card', amountCents: 5000, url: 'https://link.infinitepay.io/andre-luiz-g4j/VC1DLUMtUg-vo7wgy656p-50,00' },
  { level: 2, subscriber: true, method: 'pix', amountCents: 2000, url: 'https://link.infinitepay.io/andre-luiz-g4j/VC1DLUMtUg-IVwAJDV7SF-20,00' },
  { level: 2, subscriber: true, method: 'card', amountCents: 2500, url: 'https://link.infinitepay.io/andre-luiz-g4j/VC1DLUMtUg-PD4oP4TA5i-25,00' },

  // ── Nível 3 ──
  { level: 3, subscriber: false, method: 'pix', amountCents: 10000, url: 'https://link.infinitepay.io/andre-luiz-g4j/VC1DLUMtUg-qCPhpd6FnF-100,00' },
  { level: 3, subscriber: false, method: 'card', amountCents: 12500, url: 'https://link.infinitepay.io/andre-luiz-g4j/VC1DLUMtUg-giO0ouAELz-125,00' },
  { level: 3, subscriber: true, method: 'pix', amountCents: 5000, url: 'https://link.infinitepay.io/andre-luiz-g4j/VC1DLUMtUg-4Ealn2wXcN-50,00' },
  { level: 3, subscriber: true, method: 'card', amountCents: 6250, url: 'https://link.infinitepay.io/andre-luiz-g4j/VC1DLUMtUg-bc144WTjEx-62,50' },

  // ── Nível 4 ──
  { level: 4, subscriber: false, method: 'pix', amountCents: 20000, url: 'https://link.infinitepay.io/andre-luiz-g4j/VC1DLUMtUg-nWftcvBzUy-200,00' },
  { level: 4, subscriber: false, method: 'card', amountCents: 25000, url: 'https://link.infinitepay.io/andre-luiz-g4j/VC1DLUMtUg-hYk6X1q6Se-250,00' },
  { level: 4, subscriber: true, method: 'pix', amountCents: 10000, url: 'https://link.infinitepay.io/andre-luiz-g4j/VC1DLUMtUg-OhF45pd5aH-100,00' },
  { level: 4, subscriber: true, method: 'card', amountCents: 12500, url: 'https://link.infinitepay.io/andre-luiz-g4j/VC1DLUMtUg-NMRAbHToKY-125,00' },

  // ── Nível 5 ──
  { level: 5, subscriber: false, method: 'pix', amountCents: 100000, url: 'https://link.infinitepay.io/andre-luiz-g4j/VC1DLUMtUg-B4Rzrb86Y8-1000,00' },
  { level: 5, subscriber: false, method: 'card', amountCents: 125000, url: 'https://link.infinitepay.io/andre-luiz-g4j/VC1DLUMtUg-S2mS5OPiiw-1250,00' },
  { level: 5, subscriber: true, method: 'pix', amountCents: 50000, url: 'https://link.infinitepay.io/andre-luiz-g4j/VC1DLUMtUg-tcTpPY1Z5a-500,00' },
  { level: 5, subscriber: true, method: 'card', amountCents: 62500, url: 'https://link.infinitepay.io/andre-luiz-g4j/VC1DLUMtUg-SRJSzKnbpD-625,00' },

  // ── Nível 6 ──
  { level: 6, subscriber: false, method: 'pix', amountCents: 200000, url: 'https://link.infinitepay.io/andre-luiz-g4j/VC1DLUMtUg-0app7bdCzE-2000,00' },
  { level: 6, subscriber: false, method: 'card', amountCents: 250000, url: 'https://link.infinitepay.io/andre-luiz-g4j/VC1DLUMtUg-XG6PAWfvmn-2500,00' },
  { level: 6, subscriber: true, method: 'pix', amountCents: 100000, url: 'https://link.infinitepay.io/andre-luiz-g4j/VC1DLTUtUg-gHYmFo5PKl-1000,00' },
  // Client labeled this "não assinante" but R$1250 can only be assinante-Cartão (L6 não-assinante = R$2000/2500).
  { level: 6, subscriber: true, method: 'card', amountCents: 125000, url: 'https://link.infinitepay.io/andre-luiz-g4j/VC1DLTUtUg-ZwZpkGtbG0-1250,00' },

  // ── Nível 7 ──
  { level: 7, subscriber: false, method: 'pix', amountCents: 1000000, url: 'https://link.infinitepay.io/andre-luiz-g4j/VC1DLTUtUg-D7RHOBwiJj-10000,00' },
  { level: 7, subscriber: false, method: 'card', amountCents: 1250000, url: 'https://link.infinitepay.io/andre-luiz-g4j/VC1DLUMtUg-Q9CJvITlVi-12500,00' },
  { level: 7, subscriber: true, method: 'pix', amountCents: 500000, url: 'https://link.infinitepay.io/andre-luiz-g4j/VC1DLUMtUg-nPcxcEhyjM-5000,00' },
  { level: 7, subscriber: true, method: 'card', amountCents: 625000, url: 'https://link.infinitepay.io/andre-luiz-g4j/VC1DLUMtUg-ACXMraj3kU-6250,00' },
];

/** The entry link for a (level, subscriber, method) combination, if present. */
export function entryLinkFor(
  level: number,
  subscriber: boolean,
  method: PaymentMethod,
): TournamentEntryLink | undefined {
  return TOURNAMENT_ENTRY_LINKS.find(
    (l) => l.level === level && l.subscriber === subscriber && l.method === method,
  );
}
