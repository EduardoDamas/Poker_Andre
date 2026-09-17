import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { InfinitePayClient } from './infinitepay.client';
import { PlayerLimitService } from '../responsible/player-limit.service';
import { SubscriptionRequestService } from './subscription-request.service';

// Deposits are bounded so a typo or an abusive charge can't run away. The ceiling
// must clear the biggest thing a player can buy — a Nível 7 entry is R$12.500 on
// card — so R$20.000 by default. Both bounds are overridable per environment
// (MIN_DEPOSIT_CENTS / MAX_DEPOSIT_CENTS on Render) so the limit can move without
// a code change; a new value takes effect on the next deploy.
const DEFAULT_MIN_DEPOSIT_CENTS = 100; // R$1
const DEFAULT_MAX_DEPOSIT_CENTS = 20_000_00; // R$20.000

function boundFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/** Amount in cents as "R$ 20.000,00" for player-facing messages. */
function brl(cents: number): string {
  return `R$ ${(cents / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

const PAID_STATUSES = new Set(['paid', 'approved', 'success', 'succeeded', 'completed', 'captured']);
const FAILED_STATUSES = new Set(['failed', 'refused', 'canceled', 'cancelled', 'declined', 'error']);

export interface CreateDepositResult {
  orderNsu: string;
  url: string;
  amountCents: number;
}

/**
 * Gateway payments (InfinitePay hosted checkout):
 *   createDeposit → mint a checkout link tied to a PaymentOrder(PENDING)
 *   handleInfinitePayWebhook → on "paid", credit the wallet exactly once
 *
 * Idempotency is layered: the PENDING→PAID transition is a race-safe conditional
 * update, and the wallet credit uses referenceId = orderNsu (ledger unique).
 */
@Injectable()
export class PaymentOrdersService {
  private readonly logger = new Logger('PaymentOrders');

  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly infinitepay: InfinitePayClient,
    private readonly limits: PlayerLimitService,
    private readonly subscriptions: SubscriptionRequestService,
  ) {}

  /** Create a deposit charge and return its hosted checkout link. */
  async createDeposit(userId: string, amountCents: number): Promise<CreateDepositResult> {
    const min = boundFromEnv('MIN_DEPOSIT_CENTS', DEFAULT_MIN_DEPOSIT_CENTS);
    const max = boundFromEnv('MAX_DEPOSIT_CENTS', DEFAULT_MAX_DEPOSIT_CENTS);
    if (!Number.isInteger(amountCents) || amountCents < min || amountCents > max) {
      throw new BadRequestException(
        `Valor inválido. Depósito entre ${brl(min)} e ${brl(max)}.`,
      );
    }
    if (!InfinitePayClient.isConfigured()) {
      throw new BadRequestException('Pagamento indisponível no momento.');
    }
    // Responsible gaming: the player's own ceilings and self-exclusion.
    await this.limits.assertDepositAllowed(userId, BigInt(amountCents));

    const orderNsu = `dep_${randomUUID()}`;
    // Record the intent BEFORE minting the link so a webhook can always resolve it.
    await this.prisma.paymentOrder.create({
      data: { orderNsu, userId, amountCents: BigInt(amountCents), purpose: 'DEPOSIT', status: 'PENDING' },
    });

    const link = await this.infinitepay.createCheckoutLink({
      orderNsu,
      amountCents,
      description: 'Depósito CAPA CONTEST',
    });

    await this.prisma.paymentOrder.update({
      where: { orderNsu },
      data: { checkoutUrl: link.url },
    });
    return { orderNsu, url: link.url, amountCents };
  }

  /**
   * Mint a per-player checkout for a subscription (Opção 2). Unlike the
   * merchant's fixed links, this one carries an order_nsu, so the webhook knows
   * who paid and releases the plan with no admin step.
   */
  async createSubscriptionCheckout(params: {
    requestId: string;
    userId: string;
    plan: string;
    amountCents: number;
  }): Promise<{ orderNsu: string; url: string }> {
    if (!InfinitePayClient.isConfigured()) {
      throw new BadRequestException('Pagamento indisponível no momento.');
    }
    const orderNsu = `sub_${randomUUID()}`;
    await this.prisma.paymentOrder.create({
      data: {
        orderNsu,
        userId: params.userId,
        amountCents: BigInt(params.amountCents),
        purpose: 'SUBSCRIPTION',
        status: 'PENDING',
      },
    });

    const link = await this.infinitepay.createCheckoutLink({
      orderNsu,
      amountCents: params.amountCents,
      description: `Assinatura CAPA CONTEST (${params.plan})`,
    });
    await this.prisma.paymentOrder.update({
      where: { orderNsu },
      data: { checkoutUrl: link.url },
    });
    return { orderNsu, url: link.url };
  }

  /**
   * Handle an InfinitePay checkout webhook. Verifies the shared token, then, if the
   * payment is confirmed, credits the payer's wallet once — or, for a subscription
   * order, releases the plan instead. Returns a small status object; never throws
   * for an unknown order (just ignores it).
   */
  async handleInfinitePayWebhook(
    payload: unknown,
    token: string | undefined,
  ): Promise<{ ok: boolean; credited: boolean }> {
    this.verifyToken(token);

    const { orderNsu, paid, failed, amountCents } = parseWebhook(payload);
    if (!orderNsu) {
      this.logger.warn(`Webhook without order_nsu: ${safeJson(payload)}`);
      return { ok: true, credited: false };
    }

    const order = await this.prisma.paymentOrder.findUnique({ where: { orderNsu } });
    if (!order) {
      this.logger.warn(`Webhook for unknown order ${orderNsu}`);
      return { ok: true, credited: false };
    }
    if (order.status === 'PAID') {
      return { ok: true, credited: false }; // already processed
    }

    if (failed) {
      await this.prisma.paymentOrder.updateMany({
        where: { orderNsu, status: 'PENDING' },
        data: { status: 'FAILED' },
      });
      return { ok: true, credited: false };
    }
    if (!paid) {
      this.logger.log(`Webhook for ${orderNsu} not a paid event; ignoring. ${safeJson(payload)}`);
      return { ok: true, credited: false };
    }
    // Defense: if the gateway reports an amount, it must match what we charged.
    if (amountCents != null && BigInt(amountCents) !== order.amountCents) {
      this.logger.error(
        `Amount mismatch for ${orderNsu}: webhook ${amountCents} vs order ${order.amountCents}`,
      );
      return { ok: true, credited: false };
    }

    // Race-safe claim: only the caller that flips PENDING→PAID acts on it.
    const claim = await this.prisma.paymentOrder.updateMany({
      where: { orderNsu, status: 'PENDING' },
      data: { status: 'PAID', paidAt: new Date() },
    });
    if (claim.count !== 1) {
      return { ok: true, credited: false }; // lost the race → already handled
    }

    // A subscription purchase buys a plan, not wallet balance: release the plan
    // and move no money through the ledger (the player paid the merchant directly).
    if (order.purpose === 'SUBSCRIPTION') {
      const granted = await this.subscriptions.confirmByOrder(orderNsu);
      this.logger.log(
        granted
          ? `Released ${granted.plan} for ${order.userId} (${orderNsu})`
          : `Paid subscription order ${orderNsu} had no open request; nothing to release`,
      );
      return { ok: true, credited: false };
    }

    const txnId = await this.wallet.deposit(order.userId, order.amountCents, {
      referenceId: orderNsu, // ledger-level idempotency backstop
      memo: `InfinitePay ${orderNsu}`,
    });
    await this.prisma.paymentOrder.update({
      where: { orderNsu },
      data: { creditTxnId: txnId },
    });
    this.logger.log(`Credited ${order.amountCents} cents to ${order.userId} for ${orderNsu}`);
    return { ok: true, credited: true };
  }

  private verifyToken(token: string | undefined): void {
    const expected = process.env.INFINITEPAY_WEBHOOK_SECRET;
    if (!expected) {
      // Not configured yet — accept but flag it, so dev/testing works and prod is noisy.
      this.logger.warn('INFINITEPAY_WEBHOOK_SECRET not set; accepting webhook unauthenticated.');
      return;
    }
    if (token !== expected) {
      throw new UnauthorizedException('Invalid webhook token.');
    }
  }
}

/**
 * Extract order id, paid/failed, and amount from a gateway webhook, tolerant of the
 * exact field names (confirmed once the account's real payload is seen). Common
 * variants are handled; unknowns fall through as "not paid".
 */
export function parseWebhook(payload: unknown): {
  orderNsu?: string;
  paid: boolean;
  failed: boolean;
  amountCents?: number;
} {
  const p = (payload ?? {}) as Record<string, any>;
  const d = (p.data ?? p) as Record<string, any>;

  const orderNsu = p.order_nsu ?? p.orderNsu ?? d.order_nsu ?? d.orderNsu;
  const rawStatus = String(p.status ?? d.status ?? p.payment_status ?? d.payment_status ?? '').toLowerCase();

  const trustReceipt = process.env.INFINITEPAY_WEBHOOK_TRUST_RECEIPT === '1';
  const paidFlag = p.paid === true || d.paid === true || p.success === true || d.success === true;

  // InfinitePay's checkout webhook carries NO status field — it fires only on a
  // successful capture, carrying a positive `paid_amount` and a `transaction_nsu`.
  // Treat that receipt shape as "paid" (still gated by the shared token + a matching
  // PENDING order + the amount check downstream). Confirmed from the real payload
  // 2026-09-11.
  const paidAmount = p.paid_amount ?? d.paid_amount;
  const hasTransaction = Boolean(p.transaction_nsu ?? d.transaction_nsu);
  const receiptPaid = typeof paidAmount === 'number' && paidAmount > 0 && hasTransaction;

  const paid =
    PAID_STATUSES.has(rawStatus) ||
    paidFlag ||
    receiptPaid ||
    (trustReceipt && !FAILED_STATUSES.has(rawStatus));
  const failed = FAILED_STATUSES.has(rawStatus);

  const amt = p.amount ?? d.amount ?? p.price ?? d.price ?? p.paid_amount ?? d.paid_amount;
  const amountCents = typeof amt === 'number' ? amt : undefined;

  return { orderNsu, paid, failed, amountCents };
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v).slice(0, 400);
  } catch {
    return '[unserializable]';
  }
}
