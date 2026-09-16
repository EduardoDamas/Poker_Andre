import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SubscriptionRequest, SubscriptionRequestStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Subscription } from '../tournament/subscription';
import { subscriptionLinkFor } from '../tournament/payment-links';

/**
 * Subscription purchase through the merchant's FIXED InfinitePay links (Opção 1,
 * agreed with the client 2026-09-16).
 *
 *   request : player picks a plan → we record the intent and hand back the link
 *   confirm : admin verifies the payment in InfinitePay → grant the plan
 *   reject  : admin rejects (payment never arrived) → nothing is granted
 *
 * A fixed link is identical for every player, so the gateway webhook carries no
 * order_nsu and cannot say who paid — hence the manual confirm, mirroring the
 * manual Pix deposit flow. Opção 2 (per-player dynamic checkout, like deposits)
 * replaces `confirm` with the webhook; everything else stays.
 *
 * No money moves through the ledger here: the player pays the merchant directly
 * at InfinitePay. Confirming only sets the user's subscription tier + expiry.
 */

/** How long each plan lasts, from the moment the admin confirms it. */
export const PLAN_DAYS: Record<Exclude<Subscription, 'NONE'>, number> = {
  MONTHLY: 30,
  QUARTERLY: 90,
  SEMIANNUAL: 180,
  ANNUAL: 365,
};

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SubscriptionRequestView {
  id: string;
  userId: string;
  displayName: string;
  phone: string;
  plan: string;
  amountCents: string;
  status: string;
  checkoutUrl: string | null;
  adminNote: string | null;
  grantedUntil: Date | null;
  requestedAt: Date;
  settledAt: Date | null;
}

@Injectable()
export class SubscriptionRequestService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Record a player's intent to buy [plan] and return the checkout link.
   * Idempotent while one is open: tapping "Assinar" twice reuses the pending
   * request instead of filling the admin queue with duplicates.
   */
  async request(userId: string, plan: string): Promise<SubscriptionRequest> {
    if (plan === 'NONE') throw new BadRequestException('Plano inválido.');
    const link = subscriptionLinkFor(plan);
    if (!link) throw new BadRequestException(`Sem link de pagamento para o plano ${plan}.`);

    const open = await this.prisma.subscriptionRequest.findFirst({
      where: { userId, status: 'REQUESTED' },
      orderBy: { requestedAt: 'desc' },
    });
    if (open) {
      if (open.plan === plan) return open;
      // Switched plan before paying: retarget the open request.
      return this.prisma.subscriptionRequest.update({
        where: { id: open.id },
        data: { plan: link.plan, amountCents: BigInt(link.amountCents), checkoutUrl: link.url },
      });
    }

    return this.prisma.subscriptionRequest.create({
      data: {
        userId,
        plan: link.plan,
        amountCents: BigInt(link.amountCents),
        checkoutUrl: link.url,
        status: 'REQUESTED',
      },
    });
  }

  /** The player's own requests (newest first) — the app shows the pending one. */
  listForUser(userId: string): Promise<SubscriptionRequest[]> {
    return this.prisma.subscriptionRequest.findMany({
      where: { userId },
      orderBy: { requestedAt: 'desc' },
      take: 20,
    });
  }

  /** Admin queue, with the player's name/phone so the payment can be matched. */
  async list(status?: SubscriptionRequestStatus): Promise<SubscriptionRequestView[]> {
    const rows = await this.prisma.subscriptionRequest.findMany({
      where: status ? { status } : undefined,
      orderBy: { requestedAt: 'desc' },
      include: { user: { select: { displayName: true, phone: true } } },
      take: 200,
    });
    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      displayName: r.user.displayName,
      phone: r.user.phone,
      plan: r.plan,
      amountCents: r.amountCents.toString(),
      status: r.status,
      checkoutUrl: r.checkoutUrl,
      adminNote: r.adminNote,
      grantedUntil: r.grantedUntil,
      requestedAt: r.requestedAt,
      settledAt: r.settledAt,
    }));
  }

  /**
   * Admin confirms the payment arrived → grant the plan. An active subscription
   * is EXTENDED from its current expiry (a renewal never loses paid days);
   * otherwise the term starts now.
   */
  async confirm(id: string, adminNote?: string): Promise<SubscriptionRequest> {
    const req = await this.getRequested(id);
    const user = await this.prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) throw new NotFoundException('Jogador não encontrado.');

    const days = PLAN_DAYS[req.plan as Exclude<Subscription, 'NONE'>];
    const current = user.subscriptionUntil;
    const from = current && current.getTime() > Date.now() ? current.getTime() : Date.now();
    const grantedUntil = new Date(from + days * DAY_MS);

    await this.prisma.user.update({
      where: { id: req.userId },
      data: { subscription: req.plan, subscriptionUntil: grantedUntil },
    });

    return this.prisma.subscriptionRequest.update({
      where: { id: req.id },
      data: { status: 'CONFIRMED', grantedUntil, adminNote, settledAt: new Date() },
    });
  }

  /** Admin rejects the request (payment never arrived). Nothing is granted. */
  async reject(id: string, adminNote?: string): Promise<SubscriptionRequest> {
    const req = await this.getRequested(id);
    return this.prisma.subscriptionRequest.update({
      where: { id: req.id },
      data: { status: 'REJECTED', adminNote, settledAt: new Date() },
    });
  }

  private async getRequested(id: string): Promise<SubscriptionRequest> {
    const req = await this.prisma.subscriptionRequest.findUnique({ where: { id } });
    if (!req) throw new NotFoundException('Pedido de assinatura não encontrado.');
    if (req.status !== 'REQUESTED') {
      throw new BadRequestException(`Pedido já está ${req.status}.`);
    }
    return req;
  }
}
