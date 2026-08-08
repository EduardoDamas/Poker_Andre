import { Injectable, NotFoundException } from '@nestjs/common';
import {
  entryLinkFor,
  PaymentMethod,
  TournamentEntryLink,
  TOURNAMENT_ENTRY_LINKS,
} from '../tournament/payment-links';
import { Subscription, SUBSCRIPTIONS, subscriptionPriceCents } from '../tournament/subscription';

export interface SubscriptionPlanInfo {
  plan: Subscription;
  priceCents: string; // string — BigInt is not JSON-serialisable
}

/**
 * Serves the InfinitePay checkout data the app needs: the correct tournament
 * entry link for a (level, subscriber, method), and the subscription plans.
 *
 * Phase interino: these are the fixed InfinitePay links. Once the InfinitePay API
 * (create-charge + webhook) is wired, entries become dynamic charges and this
 * layer switches to generating them on the fly — the app-facing contract stays.
 */
@Injectable()
export class PaymentsService {
  /** Checkout link + amount for a tournament entry. 404 if none is configured. */
  tournamentEntry(level: number, subscriber: boolean, method: PaymentMethod): TournamentEntryLink {
    const link = entryLinkFor(level, subscriber, method);
    if (!link) {
      throw new NotFoundException(
        `Sem link de entrada para nível ${level}, ${subscriber ? 'assinante' : 'não assinante'}, ${method}.`,
      );
    }
    return link;
  }

  /** Every configured tournament entry link (all levels × subscriber × method). */
  allTournamentEntries(): TournamentEntryLink[] {
    return TOURNAMENT_ENTRY_LINKS;
  }

  /** Purchasable subscription plans with prices (NONE excluded — it's the free tier). */
  subscriptionPlans(): SubscriptionPlanInfo[] {
    return SUBSCRIPTIONS.filter((s) => s !== 'NONE').map((plan) => ({
      plan,
      priceCents: subscriptionPriceCents(plan).toString(),
    }));
  }
}
