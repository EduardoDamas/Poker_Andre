import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PaymentsService, SubscriptionPlanInfo } from './payments.service';
import { TournamentEntryLink } from '../tournament/payment-links';
import { EntryLinkQueryDto } from './dto/entry-link-query.dto';

// Payment info for logged-in players (InfinitePay checkout links + plans).
@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

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
