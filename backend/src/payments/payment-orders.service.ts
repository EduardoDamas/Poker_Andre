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

// Deposits are bounded to keep test/abuse blast radius small; tune for launch.
const MIN_DEPOSIT_CENTS = 100; // R$1
const MAX_DEPOSIT_CENTS = 5_000_00; // R$5.000

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
  ) {}

  /** Create a deposit charge and return its hosted checkout link. */
  async createDeposit(userId: string, amountCents: number): Promise<CreateDepositResult> {
    if (!Number.isInteger(amountCents) || amountCents < MIN_DEPOSIT_CENTS || amountCents > MAX_DEPOSIT_CENTS) {
      throw new BadRequestException(
        `Valor inválido. Depósito entre R$${MIN_DEPOSIT_CENTS / 100} e R$${MAX_DEPOSIT_CENTS / 100}.`,
      );
    }
    if (!InfinitePayClient.isConfigured()) {
      throw new BadRequestException('Pagamento indisponível no momento.');
    }

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
   * Handle an InfinitePay checkout webhook. Verifies the shared token, then, if the
   * payment is confirmed, credits the payer's wallet once. Returns a small status
   * object; never throws for an unknown order (just ignores it).
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

    // Race-safe claim: only the caller that flips PENDING→PAID credits the wallet.
    const claim = await this.prisma.paymentOrder.updateMany({
      where: { orderNsu, status: 'PENDING' },
      data: { status: 'PAID', paidAt: new Date() },
    });
    if (claim.count !== 1) {
      return { ok: true, credited: false }; // lost the race → already credited
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
  const paid = PAID_STATUSES.has(rawStatus) || paidFlag || (trustReceipt && !FAILED_STATUSES.has(rawStatus));
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
