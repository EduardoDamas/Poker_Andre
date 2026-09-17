import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, JwtPayload } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { PaymentsService, SubscriptionPlanInfo } from './payments.service';
import { PaymentOrdersService, CreateDepositResult } from './payment-orders.service';
import { TournamentEntryLink } from '../tournament/payment-links';
import { EntryLinkQueryDto } from './dto/entry-link-query.dto';
import { CreateDepositDto } from './dto/create-deposit.dto';
import { CreateSubscriptionRequestDto } from './dto/create-subscription-request.dto';
import { SubscriptionRequestService } from './subscription-request.service';

/** What the app gets back after asking to buy a plan. */
export interface SubscriptionRequestResult {
  id: string;
  plan: string;
  amountCents: string;
  status: string;
  url: string;
  requestedAt: Date;
}

// Payment info for logged-in players (InfinitePay checkout links + plans).
@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly orders: PaymentOrdersService,
    private readonly subRequests: SubscriptionRequestService,
  ) {}

  /** POST /payments/deposit { amountCents } → a hosted checkout link to pay. */
  @Post('deposit')
  deposit(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateDepositDto,
  ): Promise<CreateDepositResult> {
    return this.orders.createDeposit(user.sub, dto.amountCents);
  }

  /** GET /payments/tournament-entry?level=&subscriber=&method= */
  @Get('tournament-entry')
  entry(@Query() q: EntryLinkQueryDto): TournamentEntryLink {
    return this.payments.tournamentEntry(q.level, q.subscriber, q.method);
  }

  /** GET /payments/tournament-entries — all entry links (levels × subscriber × method). */
  @Get('tournament-entries')
  entries(): TournamentEntryLink[] {
    return this.payments.allTournamentEntries();
  }

  /** GET /payments/subscriptions — the purchasable plans and their prices. */
  @Get('subscriptions')
  subscriptions(): SubscriptionPlanInfo[] {
    return this.payments.subscriptionPlans();
  }

  /**
   * POST /payments/subscription-request { plan } → the checkout link to open.
   * Records the intent so the admin can confirm the payment in the panel (the
   * merchant's links are fixed, so the webhook cannot attribute them).
   */
  @Post('subscription-request')
  async requestSubscription(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateSubscriptionRequestDto,
  ): Promise<SubscriptionRequestResult> {
    let req = await this.subRequests.request(user.sub, dto.plan);

    // Opção 2, behind SUBSCRIPTION_CHECKOUT=dynamic: mint a per-player checkout
    // so the webhook can release the plan by itself. Falls back to the
    // merchant's fixed link (admin confirms) if the gateway is unavailable —
    // never leave the player without a way to pay.
    if (process.env.SUBSCRIPTION_CHECKOUT === 'dynamic' && !req.orderNsu) {
      try {
        const order = await this.orders.createSubscriptionCheckout({
          requestId: req.id,
          userId: user.sub,
          plan: req.plan,
          amountCents: Number(req.amountCents),
        });
        req = await this.subRequests.attachOrder(req.id, order.orderNsu, order.url);
      } catch {
        // keep the fixed link already on the request
      }
    }

    return {
      id: req.id,
      plan: req.plan,
      amountCents: req.amountCents.toString(),
      status: req.status,
      url: req.checkoutUrl ?? '',
      requestedAt: req.requestedAt,
    };
  }

  /** GET /payments/subscription-requests — this player's own requests. */
  @Get('subscription-requests')
  async mySubscriptionRequests(@CurrentUser() user: JwtPayload): Promise<SubscriptionRequestResult[]> {
    const rows = await this.subRequests.listForUser(user.sub);
    return rows.map((r) => ({
      id: r.id,
      plan: r.plan,
      amountCents: r.amountCents.toString(),
      status: r.status,
      url: r.checkoutUrl ?? '',
      requestedAt: r.requestedAt,
    }));
  }
}
