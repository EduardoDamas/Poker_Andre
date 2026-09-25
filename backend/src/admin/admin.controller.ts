import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { WithdrawalStatus, DepositStatus, Deposit, SubscriptionRequestStatus, PromoEvent } from '@prisma/client';
import { JwtAuthGuard, JwtPayload } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { WithdrawalService } from '../wallet/withdrawal.service';
import { DepositService } from '../wallet/deposit.service';
import { AuditService } from '../audit/audit.service';
import { AdminGuard } from './admin.guard';
import { AdminService, AdminPlayer, AdminWithdrawal } from './admin.service';
import { SettleWithdrawalDto } from './dto/settle-withdrawal.dto';
import { SettleDepositDto } from '../wallet/dto/deposit.dto';
import { GrantSubscriptionDto } from './dto/grant-subscription.dto';
import { BlockUserDto } from './dto/block-user.dto';
import { SettleSubscriptionRequestDto } from './dto/settle-subscription-request.dto';
import { SubscriptionRequestService } from '../payments/subscription-request.service';
import { PromoService, promoRoomId } from '../promo/promo.service';
import { PromoBracket, PromoBrackets } from '../promo/promo-bracket';
import { CreatePromoEventDto } from './dto/create-promo-event.dto';

/** BigInt-free view of a promotion, with its live bracket when there is one. */
function serializePromo(
  e: PromoEvent,
  bracket?: PromoBracket,
  winner?: { displayName: string; phone: string },
  subscriberDifference: 'REQUESTED' | 'CONFIRMED' | null = null,
) {
  return {
    id: e.id,
    name: e.name,
    startsAt: e.startsAt,
    prizeCents: e.prizeCents.toString(),
    prizeSubscriberCents: e.prizeSubscriberCents.toString(),
    minPlayers: e.minPlayers,
    maxPlayers: e.maxPlayers,
    waitMinutes: e.waitMinutes,
    robots: e.robots,
    status: e.status,
    winnerId: e.winnerId,
    winnerName: winner?.displayName ?? null,
    winnerPhone: winner?.phone ?? null,
    winnerSubscribed: e.winnerSubscribed,
    prizePaidCents: e.prizePaidCents?.toString() ?? null,
    paidAt: e.paidAt,
    startedAt: e.startedAt,
    startedWith: e.startedWith,
    // Paid as a non-subscriber, but the winner asked for a plan before the
    // start: REQUESTED = release it in Assinaturas; CONFIRMED = pay the difference.
    subscriberDifference,
    live: bracket
      ? {
          registered: bracket.registered,
          started: bracket.started,
          startedWith: bracket.startedWith,
          round: bracket.round,
          alive: bracket.aliveCount,
          tablesLeft: bracket.tablesLeft(),
          championId: bracket.champion,
        }
      : null,
  };
}

function serializeDeposit(d: Deposit) {
  return {
    id: d.id,
    userId: d.userId,
    amountCents: d.amountCents.toString(),
    pixReference: d.pixReference,
    status: d.status,
    requestedAt: d.requestedAt,
    settledAt: d.settledAt,
    adminNote: d.adminNote,
  };
}

// Every route here requires a valid JWT (JwtAuthGuard) AND the ADMIN role (AdminGuard).
@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly withdrawals: WithdrawalService,
    private readonly deposits: DepositService,
    private readonly audit: AuditService,
    private readonly subRequests: SubscriptionRequestService,
    private readonly promo: PromoService,
    private readonly brackets: PromoBrackets,
  ) {}

  @Get('players')
  players(): Promise<AdminPlayer[]> {
    return this.admin.listPlayers();
  }

  // Reject a pending application — frees the phone/CPF for re-registration.
  @Post('users/:id/reject')
  async rejectUser(@CurrentUser() admin: JwtPayload, @Param('id') id: string): Promise<{ ok: true }> {
    const freed = await this.admin.rejectApplication(id);
    await this.audit.record({
      actorId: admin.sub, action: 'user.reject', targetType: 'user', targetId: id, metadata: freed,
    });
    return { ok: true };
  }

  // Block a user (temporary if untilMs provided, else permanent).
  @Post('users/:id/block')
  async blockUser(
    @CurrentUser() admin: JwtPayload,
    @Param('id') id: string,
    @Body() dto: BlockUserDto,
  ): Promise<{ ok: true }> {
    await this.admin.blockUser(id, dto.reason, dto.untilMs);
    await this.audit.record({
      actorId: admin.sub, action: 'user.block', targetType: 'user', targetId: id,
      metadata: { reason: dto.reason, untilMs: dto.untilMs ?? null },
    });
    return { ok: true };
  }

  // Unblock a user.
  @Post('users/:id/unblock')
  async unblockUser(@CurrentUser() admin: JwtPayload, @Param('id') id: string): Promise<{ ok: true }> {
    await this.admin.unblockUser(id);
    await this.audit.record({
      actorId: admin.sub, action: 'user.unblock', targetType: 'user', targetId: id,
    });
    return { ok: true };
  }

  @Get('withdrawals')
  listWithdrawals(@Query('status') status?: WithdrawalStatus): Promise<AdminWithdrawal[]> {
    return this.admin.listWithdrawals(status);
  }

  // Admin confirms the manual Pix transfer was made — funds leave the system.
  @Post('withdrawals/:id/approve')
  async approve(
    @CurrentUser() admin: JwtPayload,
    @Param('id') id: string,
    @Body() dto: SettleWithdrawalDto,
  ): Promise<AdminWithdrawal> {
    const wd = await this.withdrawals.approve(id, dto.adminNote);
    await this.audit.record({
      actorId: admin.sub,
      action: 'withdrawal.approve',
      targetType: 'withdrawal',
      targetId: wd.id,
      metadata: { amountCents: wd.amountCents.toString(), note: dto.adminNote },
    });
    return AdminService.serializeWithdrawal(wd);
  }

  // Admin rejects the request — reserved funds return to the player.
  @Post('withdrawals/:id/reject')
  async reject(
    @CurrentUser() admin: JwtPayload,
    @Param('id') id: string,
    @Body() dto: SettleWithdrawalDto,
  ): Promise<AdminWithdrawal> {
    const wd = await this.withdrawals.reject(id, dto.adminNote);
    await this.audit.record({
      actorId: admin.sub,
      action: 'withdrawal.reject',
      targetType: 'withdrawal',
      targetId: wd.id,
      metadata: { amountCents: wd.amountCents.toString(), note: dto.adminNote },
    });
    return AdminService.serializeWithdrawal(wd);
  }

  // --- Deposits (manual Pix) ---

  @Get('deposits')
  async listDeposits(@Query('status') status?: DepositStatus) {
    return (await this.deposits.list(status)).map(serializeDeposit);
  }

  // Admin confirms the Pix was received → wallet credited.
  @Post('deposits/:id/confirm')
  async confirmDeposit(
    @CurrentUser() admin: JwtPayload,
    @Param('id') id: string,
    @Body() dto: SettleDepositDto,
  ) {
    const dep = await this.deposits.confirm(id, dto.adminNote);
    await this.audit.record({
      actorId: admin.sub, action: 'deposit.confirm', targetType: 'deposit', targetId: dep.id,
      metadata: { amountCents: dep.amountCents.toString(), note: dto.adminNote },
    });
    return serializeDeposit(dep);
  }

  @Post('deposits/:id/reject')
  async rejectDeposit(
    @CurrentUser() admin: JwtPayload,
    @Param('id') id: string,
    @Body() dto: SettleDepositDto,
  ) {
    const dep = await this.deposits.reject(id, dto.adminNote);
    await this.audit.record({
      actorId: admin.sub, action: 'deposit.reject', targetType: 'deposit', targetId: dep.id,
      metadata: { note: dto.adminNote },
    });
    return serializeDeposit(dep);
  }

  // --- Promotions (free entry, one company-funded prize) ---

  /** Schedule a promotion. Its room appears in the lobby 30 minutes before. */
  @Post('promo-events')
  async createPromoEvent(@CurrentUser() admin: JwtPayload, @Body() dto: CreatePromoEventDto) {
    const event = await this.promo.createEvent({
      name: dto.name,
      startsAt: new Date(dto.startsAt),
      prizeCents: BigInt(dto.prizeCents),
      prizeSubscriberCents: BigInt(dto.prizeSubscriberCents),
      minPlayers: dto.minPlayers,
      maxPlayers: dto.maxPlayers,
      waitMinutes: dto.waitMinutes,
      robots: dto.robots,
    });
    await this.audit.record({
      actorId: admin.sub, action: 'promo.create', targetType: 'promoEvent', targetId: event.id,
      metadata: { name: event.name, startsAt: event.startsAt.toISOString(), prizeCents: dto.prizeCents,
        prizeSubscriberCents: dto.prizeSubscriberCents, minPlayers: event.minPlayers,
        maxPlayers: event.maxPlayers, waitMinutes: event.waitMinutes, robots: event.robots },
    });
    return serializePromo(event);
  }

  /** Every promotion, newest first, with who won and what was paid. */
  @Get('promo-events')
  async listPromoEvents() {
    const events = await this.promo.list();
    const winners = await this.promo.winners(events);
    return Promise.all(
      events.map(async (e) =>
        serializePromo(
          e,
          this.brackets.get(promoRoomId(e.id)),
          e.winnerId ? winners.get(e.winnerId) : undefined,
          await this.promo.pendingSubscriberDifference(e),
        ),
      ),
    );
  }

  /** Pay a winner the subscriber difference once their pre-start plan is released. */
  @Post('promo-events/:id/subscriber-difference')
  async paySubscriberDifference(@CurrentUser() admin: JwtPayload, @Param('id') id: string) {
    const payout = await this.promo.topUpSubscriberPrize(id);
    await this.audit.record({
      actorId: admin.sub, action: 'promo.subscriber-difference', targetType: 'promoEvent', targetId: id,
      metadata: { winnerId: payout.winnerId, differenceCents: payout.prizeCents.toString() },
    });
    return { ok: true, differenceCents: payout.prizeCents.toString() };
  }

  /** Call off a promotion that has not paid out. */
  @Post('promo-events/:id/cancel')
  async cancelPromoEvent(@CurrentUser() admin: JwtPayload, @Param('id') id: string) {
    const event = await this.promo.cancel(id);
    await this.audit.record({
      actorId: admin.sub, action: 'promo.cancel', targetType: 'promoEvent', targetId: id,
    });
    return serializePromo(event);
  }

  // --- Subscription purchases (fixed InfinitePay links → admin confirms) ---

  /** The purchase queue; defaults to what still needs a decision. */
  @Get('subscription-requests')
  listSubscriptionRequests(@Query('status') status?: SubscriptionRequestStatus) {
    return this.subRequests.list(status ?? 'REQUESTED');
  }

  // Admin saw the payment in InfinitePay → grant the plan.
  @Post('subscription-requests/:id/confirm')
  async confirmSubscriptionRequest(
    @CurrentUser() admin: JwtPayload,
    @Param('id') id: string,
    @Body() dto: SettleSubscriptionRequestDto,
  ) {
    const req = await this.subRequests.confirm(id, dto.adminNote);
    await this.audit.record({
      actorId: admin.sub, action: 'subscription.confirm', targetType: 'subscriptionRequest', targetId: req.id,
      metadata: { userId: req.userId, plan: req.plan, amountCents: req.amountCents.toString(), grantedUntil: req.grantedUntil?.toISOString() ?? null },
    });
    return { ok: true, plan: req.plan, grantedUntil: req.grantedUntil };
  }

  // Payment never arrived → reject; nothing is granted.
  @Post('subscription-requests/:id/reject')
  async rejectSubscriptionRequest(
    @CurrentUser() admin: JwtPayload,
    @Param('id') id: string,
    @Body() dto: SettleSubscriptionRequestDto,
  ) {
    const req = await this.subRequests.reject(id, dto.adminNote);
    await this.audit.record({
      actorId: admin.sub, action: 'subscription.reject', targetType: 'subscriptionRequest', targetId: req.id,
      metadata: { userId: req.userId, plan: req.plan, note: dto.adminNote ?? null },
    });
    return { ok: true };
  }

  // --- Subscriptions (manual grant; independent of the purchase queue) ---

  // Grant/set a player's subscription tier (Phase 1: admin-assigned).
  @Post('users/:id/subscription')
  async grantSubscription(
    @CurrentUser() admin: JwtPayload,
    @Param('id') id: string,
    @Body() dto: GrantSubscriptionDto,
  ): Promise<{ ok: true }> {
    await this.admin.setSubscription(id, dto.subscription, dto.untilMs);
    await this.audit.record({
      actorId: admin.sub, action: 'user.subscription', targetType: 'user', targetId: id,
      metadata: { subscription: dto.subscription, untilMs: dto.untilMs ?? null },
    });
    return { ok: true };
  }
}
