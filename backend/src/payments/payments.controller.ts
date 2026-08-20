import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, JwtPayload } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { PaymentsService, SubscriptionPlanInfo } from './payments.service';
import { PaymentOrdersService, CreateDepositResult } from './payment-orders.service';
import { TournamentEntryLink } from '../tournament/payment-links';
import { EntryLinkQueryDto } from './dto/entry-link-query.dto';
import { CreateDepositDto } from './dto/create-deposit.dto';

// Payment info for logged-in players (InfinitePay checkout links + plans).
@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly orders: PaymentOrdersService,
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
}
