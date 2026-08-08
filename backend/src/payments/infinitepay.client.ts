import { Injectable } from '@nestjs/common';

export interface CheckoutLink {
  url: string;
  orderNsu: string;
}

/**
 * Thin client for InfinitePay's Checkout API (create a hosted payment link).
 *
 * Shape from the merchant's Documentação:
 *   POST {base}/links  { handle, order_nsu, items:[{description, price, quantity}], webhook_url }
 * `price` is in integer cents (same unit as the wallet ledger).
 *
 * Config from the environment (no secret in code):
 *   INFINITEPAY_HANDLE    — the merchant's InfiniteTag (e.g. andre-luiz-g4j)
 *   INFINITEPAY_API_BASE  — optional, default https://api.checkout.infinitepay.io
 *   INFINITEPAY_API_KEY   — optional bearer token, if the account requires one
 *   PUBLIC_BASE_URL       — our public https base, used to build webhook_url
 *
 * The webhook receiver + payment verification (payment_check) are wired once the
 * account's exact auth/webhook fields are confirmed; this only mints the link.
 */
@Injectable()
export class InfinitePayClient {
  static isConfigured(): boolean {
    return Boolean(process.env.INFINITEPAY_HANDLE);
  }

  private config() {
    const handle = process.env.INFINITEPAY_HANDLE;
    if (!handle) return null;
    return {
      handle,
      base: (process.env.INFINITEPAY_API_BASE ?? 'https://api.checkout.infinitepay.io').replace(/\/$/, ''),
      token: process.env.INFINITEPAY_API_KEY,
      publicBase: process.env.PUBLIC_BASE_URL?.replace(/\/$/, ''),
    };
  }

  /** Create a hosted checkout link for a single charge (amount in integer cents). */
  async createCheckoutLink(p: {
    orderNsu: string;
    amountCents: number;
    description: string;
  }): Promise<CheckoutLink> {
    const cfg = this.config();
    if (!cfg) throw new Error('InfinitePay not configured (INFINITEPAY_HANDLE).');

    const body: Record<string, unknown> = {
      handle: cfg.handle,
      order_nsu: p.orderNsu,
      items: [{ description: p.description, price: p.amountCents, quantity: 1 }],
    };
    if (cfg.publicBase) body.webhook_url = `${cfg.publicBase}/payments/webhook/infinitepay`;

    const res = await fetch(`${cfg.base}/links`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cfg.token ? { Authorization: `Bearer ${cfg.token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`InfinitePay createLink failed (${res.status}): ${text.slice(0, 200)}`);
    }
    const data = (await res.json().catch(() => ({}))) as {
      url?: string;
      link?: string;
      checkout_url?: string;
    };
    const url = data.url ?? data.link ?? data.checkout_url;
    if (!url) throw new Error('InfinitePay createLink: no url in the response.');
    return { url, orderNsu: p.orderNsu };
  }
}
