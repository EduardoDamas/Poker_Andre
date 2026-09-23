import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, PromoEvent } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from '../wallet/ledger.service';
import { WalletService } from '../wallet/wallet.service';
import { ensureAccount } from '../wallet/account-util';
import { isBlocked } from '../auth/user-status';

/** Singleton system account that funds promotional prizes. */
export const PROMOTIONS_ACCOUNT_ID = '00000000-0000-0000-0000-000000000006';

/** The room opens this long before the start, so players can take their seats. */
export const PROMO_OPENS_MINUTES_BEFORE = 30;
/** An event nobody played disappears this long after its start. Nothing is paid. */
export const PROMO_CLOSES_HOURS_AFTER = 3;

/** Lobby/table id of an event's room. */
export const promoRoomId = (eventId: string) => `promo-${eventId}`;
/** The event id behind a promo room id, or null for any other room. */
export const promoEventIdOf = (roomId: string): string | null =>
  roomId.startsWith('promo-') ? roomId.slice('promo-'.length) : null;

export interface PromoPayout {
  eventId: string;
  winnerId: string;
  subscribed: boolean;
  prizeCents: bigint;
  txnId: string;
  /** False when this call found the prize already paid to this same winner. */
  paidNow: boolean;
}

/**
 * Free-entry promotions with a single company-funded prize (client spec,
 * 2026-09-21: R$250 to the winner, R$500 if the winner is a subscriber).
 *
 * Entry is free, so there is no prize pool to pay from. The prize comes out of
 * the PROMOTIONS system account, whose balance therefore reads as total promo
 * spend — a marketing cost kept apart from what the tables earn (HOUSE_RAKE).
 *
 * Exactly one prize per event, however many times or from however many places
 * the award is attempted: the ledger reference promo-prize-<eventId> is unique,
 * and the event row is claimed SCHEDULED → PAID only once.
 *
 * Whether the winner counts as a subscriber is decided by the caller, from a
 * snapshot taken when the tournament started — so subscribing mid-tournament
 * does not change the prize, and the rule can be stated plainly to players.
 */
@Injectable()
export class PromoService {
  private readonly logger = new Logger('Promo');

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly wallet: WalletService,
  ) {}

  async createEvent(params: {
    name: string;
    startsAt: Date;
    prizeCents: bigint;
    prizeSubscriberCents: bigint;
    minPlayers?: number;
  }): Promise<PromoEvent> {
    const { name, startsAt, prizeCents, prizeSubscriberCents } = params;
    const minPlayers = params.minPlayers ?? 2;
    if (!Number.isInteger(minPlayers) || minPlayers < 2) {
      throw new BadRequestException('O mínimo de participantes deve ser 2 ou mais.');
    }
    if (!name.trim()) throw new BadRequestException('Dê um nome à promoção.');
    if (prizeCents <= 0n || prizeSubscriberCents <= 0n) {
      throw new BadRequestException('Os prêmios devem ser maiores que zero.');
    }
    if (prizeSubscriberCents < prizeCents) {
      // The whole point of the campaign is that subscribing pays more.
      throw new BadRequestException('O prêmio do assinante não pode ser menor que o do não assinante.');
    }
    return this.prisma.promoEvent.create({
      data: { name: name.trim(), startsAt, prizeCents, prizeSubscriberCents, minPlayers },
    });
  }

  /**
   * The event if its room is open right now: still unpaid, from
   * PROMO_OPENS_MINUTES_BEFORE the start until PROMO_CLOSES_HOURS_AFTER it.
   */
  async openEvent(eventId: string, now: Date = new Date()): Promise<PromoEvent | null> {
    const event = await this.prisma.promoEvent.findUnique({ where: { id: eventId } });
    return event && this.isOpen(event, now) ? event : null;
  }

  /** Every event whose room is open right now — what the lobby lists. */
  async openEvents(now: Date = new Date()): Promise<PromoEvent[]> {
    const candidates = await this.prisma.promoEvent.findMany({
      where: {
        status: 'SCHEDULED',
        startsAt: {
          lte: new Date(now.getTime() + PROMO_OPENS_MINUTES_BEFORE * 60_000),
          gte: new Date(now.getTime() - PROMO_CLOSES_HOURS_AFTER * 3_600_000),
        },
      },
      orderBy: { startsAt: 'asc' },
    });
    return candidates.filter((e) => this.isOpen(e, now));
  }

  private isOpen(event: PromoEvent, now: Date): boolean {
    if (event.status !== 'SCHEDULED') return false;
    const opens = event.startsAt.getTime() - PROMO_OPENS_MINUTES_BEFORE * 60_000;
    const closes = event.startsAt.getTime() + PROMO_CLOSES_HOURS_AFTER * 3_600_000;
    return now.getTime() >= opens && now.getTime() <= closes;
  }

  /** The player's effective subscription right now (expired plans don't count). */
  async isSubscribedNow(userId: string, at: Date = new Date()): Promise<boolean> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.subscription === 'NONE') return false;
    return !user.subscriptionUntil || user.subscriptionUntil.getTime() > at.getTime();
  }

  /**
   * Pay the event's single prize to [winnerId]. Idempotent for the same winner;
   * refuses a second, different winner, a cancelled event and a blocked account.
   */
  async awardPrize(params: {
    eventId: string;
    winnerId: string;
    subscribedAtStart: boolean;
  }): Promise<PromoPayout> {
    const { eventId, winnerId, subscribedAtStart } = params;
    const event = await this.prisma.promoEvent.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Promoção não encontrada.');
    if (event.status === 'CANCELLED') throw new BadRequestException('Esta promoção foi cancelada.');
    if (event.status === 'PAID') return this.alreadyPaid(event, winnerId);

    const winner = await this.prisma.user.findUnique({ where: { id: winnerId } });
    if (!winner) throw new NotFoundException('Vencedor não encontrado.');
    if (isBlocked(winner)) {
      throw new BadRequestException('A conta do vencedor está bloqueada. Prêmio retido para análise.');
    }

    const prizeCents = subscribedAtStart ? event.prizeSubscriberCents : event.prizeCents;
    const promotions = await ensureAccount(
      this.prisma,
      { id: PROMOTIONS_ACCOUNT_ID },
      { id: PROMOTIONS_ACCOUNT_ID, type: 'PROMOTIONS' },
    );
    const player = await this.wallet.ensurePlayerAccount(winnerId);

    let txnId: string;
    try {
      txnId = await this.ledger.post({
        kind: 'PROMO_PRIZE',
        referenceId: `promo-prize-${eventId}`,
        memo: `Prêmio da promoção "${event.name}"${subscribedAtStart ? ' (assinante)' : ''}`,
        postings: [
          { accountId: promotions.id, amountCents: -prizeCents },
          { accountId: player.id, amountCents: prizeCents },
        ],
      });
    } catch (e) {
      // A concurrent award won the unique reference. Decide from the ledger —
      // written atomically with the payment — not from the event row, which
      // the winning call may not have updated yet.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const paid = await this.paidFromLedger(eventId);
        if (paid && paid.winnerId === winnerId) {
          return { eventId, winnerId, subscribed: subscribedAtStart, prizeCents: paid.prizeCents, txnId: paid.txnId, paidNow: false };
        }
        throw new BadRequestException('O prêmio desta promoção já foi pago a outro vencedor.');
      }
      throw e;
    }

    await this.prisma.promoEvent.updateMany({
      where: { id: eventId, status: 'SCHEDULED' },
      data: {
        status: 'PAID',
        winnerId,
        winnerSubscribed: subscribedAtStart,
        prizePaidCents: prizeCents,
        prizeTxnId: txnId,
        paidAt: new Date(),
      },
    });
    // Feeds the public winners feed and the rankings, like any tournament win.
    await this.prisma.tournamentWin.create({
      data: { userId: winnerId, level: 0, prizeCents, multiplier: 0 },
    });

    this.logger.log(`Promo "${event.name}": ${prizeCents} cents to ${winnerId}`);
    return { eventId, winnerId, subscribed: subscribedAtStart, prizeCents, txnId, paidNow: true };
  }

  /** All events, newest first (admin view). */
  list(): Promise<PromoEvent[]> {
    return this.prisma.promoEvent.findMany({ orderBy: { startsAt: 'desc' }, take: 100 });
  }

  /** Cancel an event that has not paid out (e.g. it never ran). */
  async cancel(eventId: string): Promise<PromoEvent> {
    const event = await this.prisma.promoEvent.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Promoção não encontrada.');
    if (event.status === 'PAID') {
      throw new BadRequestException('O prêmio já foi pago; a promoção não pode ser cancelada.');
    }
    return this.prisma.promoEvent.update({ where: { id: eventId }, data: { status: 'CANCELLED' } });
  }

  /** Total spent on promotional prizes so far (positive cents). */
  async totalSpentCents(): Promise<bigint> {
    const acc = await this.prisma.account.findUnique({ where: { id: PROMOTIONS_ACCOUNT_ID } });
    return acc ? -(await this.ledger.balanceOf(acc.id)) : 0n;
  }

  /** Who the ledger says was paid for this event, if anyone. */
  private async paidFromLedger(
    eventId: string,
  ): Promise<{ winnerId: string; prizeCents: bigint; txnId: string } | null> {
    const txn = await this.prisma.ledgerTransaction.findUnique({
      where: { referenceId: `promo-prize-${eventId}` },
      include: { entries: { include: { account: true } } },
    });
    const credit = txn?.entries.find((en) => en.amountCents > 0n && en.account.userId);
    if (!txn || !credit?.account.userId) return null;
    return { winnerId: credit.account.userId, prizeCents: credit.amountCents, txnId: txn.id };
  }

  private alreadyPaid(event: PromoEvent, winnerId: string): PromoPayout {
    if (event.winnerId !== winnerId) {
      throw new BadRequestException('O prêmio desta promoção já foi pago a outro vencedor.');
    }
    return {
      eventId: event.id,
      winnerId,
      subscribed: !!event.winnerSubscribed,
      prizeCents: event.prizePaidCents ?? 0n,
      txnId: event.prizeTxnId ?? '',
      paidNow: false,
    };
  }
}
