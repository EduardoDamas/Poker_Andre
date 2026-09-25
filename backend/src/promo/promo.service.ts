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
/** A scheduled event is announced (lobby, download page) this long before it starts. */
export const PROMO_ANNOUNCE_DAYS = 14;

/** When an event's room opens for players. */
export const promoOpensAt = (event: { startsAt: Date }) =>
  new Date(event.startsAt.getTime() - PROMO_OPENS_MINUTES_BEFORE * 60_000);

/**
 * Most places an event may offer: 10 tables of up to 10 players, whose winners
 * fill one final table of 10. A bigger field would need a semi-final round.
 */
export const PROMO_MAX_PLAYERS = 100;

/** Lobby/table id of an event's room. */
export const promoRoomId = (eventId: string) => `promo-${eventId}`;
/**
 * The event id behind a promo room id, or null for any other room — including
 * the bracket's own tables (promo-<id>-r1-t3), which nobody joins directly.
 */
export const promoEventIdOf = (roomId: string): string | null =>
  /^promo-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(roomId)?.[1] ?? null;

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
    maxPlayers?: number;
    waitMinutes?: number | null;
    robots?: number;
  }): Promise<PromoEvent> {
    const { name, startsAt, prizeCents, prizeSubscriberCents } = params;
    const minPlayers = params.minPlayers ?? 2;
    const maxPlayers = params.maxPlayers ?? PROMO_MAX_PLAYERS;
    const waitMinutes = params.waitMinutes === undefined ? 30 : params.waitMinutes;
    const robots = params.robots ?? 0;
    if (!Number.isInteger(minPlayers) || minPlayers < 2) {
      throw new BadRequestException('O mínimo de participantes deve ser 2 ou mais.');
    }
    if (!Number.isInteger(maxPlayers) || maxPlayers < minPlayers || maxPlayers > PROMO_MAX_PLAYERS) {
      throw new BadRequestException(
        `As vagas devem ficar entre o mínimo de participantes e ${PROMO_MAX_PLAYERS}.`,
      );
    }
    if (waitMinutes !== null && (!Number.isInteger(waitMinutes) || waitMinutes < 0)) {
      throw new BadRequestException('A tolerância deve ser em minutos (0 ou mais).');
    }
    if (!Number.isInteger(robots) || robots < 0 || robots >= maxPlayers) {
      throw new BadRequestException('Os robôs do ensaio devem ser menos que as vagas.');
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
      data: {
        name: name.trim(), startsAt, prizeCents, prizeSubscriberCents, minPlayers, maxPlayers, waitMinutes, robots,
      },
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

  /**
   * Events to announce: scheduled, from PROMO_ANNOUNCE_DAYS before the start
   * until the room closes — so players see the date and come back for it.
   */
  announcedEvents(now: Date = new Date()): Promise<PromoEvent[]> {
    return this.prisma.promoEvent.findMany({
      where: {
        status: 'SCHEDULED',
        startsAt: {
          lte: new Date(now.getTime() + PROMO_ANNOUNCE_DAYS * 86_400_000),
          gte: new Date(now.getTime() - PROMO_CLOSES_HOURS_AFTER * 3_600_000),
        },
      },
      orderBy: { startsAt: 'asc' },
    });
  }

  find(eventId: string): Promise<PromoEvent | null> {
    return this.prisma.promoEvent.findUnique({ where: { id: eventId } });
  }

  isOpen(event: PromoEvent, now: Date = new Date()): boolean {
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

  /**
   * Close a rehearsal: record its champion (possibly a robot) and pay nothing —
   * no ledger movement, no entry in the winners feed.
   */
  async finishRehearsal(eventId: string, championId: string): Promise<void> {
    await this.prisma.promoEvent.updateMany({
      where: { id: eventId, status: 'SCHEDULED', robots: { gt: 0 } },
      data: { status: 'PAID', winnerId: championId, winnerSubscribed: false, prizePaidCents: 0n, paidAt: new Date() },
    });
  }

  /** Record when the bracket started and with how many (fire and forget). */
  async markStarted(eventId: string, at: Date, players: number): Promise<void> {
    await this.prisma.promoEvent.updateMany({
      where: { id: eventId, startedAt: null },
      data: { startedAt: at, startedWith: players },
    });
  }

  /**
   * Did [userId] ask for a plan before [at] that has since been released and
   * covered [at]? Plans bought through the fixed links are released by hand in
   * the panel, often minutes after the payment: a player who paid before the
   * start is a subscriber "até o início" even if the release came later.
   */
  async subscribedByRequestAt(userId: string, at: Date): Promise<boolean> {
    const req = await this.prisma.subscriptionRequest.findFirst({
      where: { userId, status: 'CONFIRMED', requestedAt: { lte: at }, grantedUntil: { gt: at } },
    });
    return !!req;
  }

  /** The winner's plan request made before the start, if any (newest first). */
  private async requestBefore(userId: string, at: Date) {
    return this.prisma.subscriptionRequest.findFirst({
      where: { userId, requestedAt: { lte: at }, status: { in: ['REQUESTED', 'CONFIRMED'] } },
      orderBy: { requestedAt: 'desc' },
    });
  }

  /**
   * For a prize paid at the non-subscriber rate: whether the winner had asked
   * for a plan before the start — still waiting for release (REQUESTED) or
   * released since (CONFIRMED, so the difference is due).
   */
  async pendingSubscriberDifference(event: PromoEvent): Promise<'REQUESTED' | 'CONFIRMED' | null> {
    if (event.status !== 'PAID' || event.winnerSubscribed || !event.winnerId || !event.startedAt) return null;
    if (event.robots > 0) return null; // a rehearsal pays nothing
    const req = await this.requestBefore(event.winnerId, event.startedAt);
    if (!req) return null;
    if (req.status === 'CONFIRMED' && !(req.grantedUntil && req.grantedUntil > event.startedAt)) return null;
    return req.status as 'REQUESTED' | 'CONFIRMED';
  }

  /**
   * Pay the subscriber difference to a winner paid as a non-subscriber whose
   * plan, asked for before the start, was released afterwards. Once only.
   */
  async topUpSubscriberPrize(eventId: string): Promise<PromoPayout> {
    const event = await this.prisma.promoEvent.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Promoção não encontrada.');
    if (event.status !== 'PAID' || !event.winnerId || !event.startedAt) {
      throw new BadRequestException('Esta promoção ainda não pagou o prêmio.');
    }
    if (event.robots > 0) throw new BadRequestException('Um ensaio não paga prêmio.');
    if (event.winnerSubscribed) throw new BadRequestException('O vencedor já recebeu o prêmio de assinante.');
    if (!(await this.subscribedByRequestAt(event.winnerId, event.startedAt))) {
      throw new BadRequestException(
        'O vencedor não tem assinatura pedida antes do início e já liberada. Libere o plano em Assinaturas primeiro.',
      );
    }
    const difference = event.prizeSubscriberCents - (event.prizePaidCents ?? event.prizeCents);
    if (difference <= 0n) throw new BadRequestException('Não há diferença a pagar.');

    const promotions = await ensureAccount(
      this.prisma,
      { id: PROMOTIONS_ACCOUNT_ID },
      { id: PROMOTIONS_ACCOUNT_ID, type: 'PROMOTIONS' },
    );
    const player = await this.wallet.ensurePlayerAccount(event.winnerId);
    let txnId: string;
    try {
      txnId = await this.ledger.post({
        kind: 'PROMO_PRIZE',
        referenceId: `promo-prize-topup-${eventId}`,
        memo: `Diferença de assinante — promoção "${event.name}"`,
        postings: [
          { accountId: promotions.id, amountCents: -difference },
          { accountId: player.id, amountCents: difference },
        ],
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new BadRequestException('A diferença desta promoção já foi paga.');
      }
      throw e;
    }
    await this.prisma.promoEvent.update({
      where: { id: eventId },
      data: { winnerSubscribed: true, prizePaidCents: event.prizeSubscriberCents },
    });
    this.logger.log(`Promo "${event.name}": subscriber difference ${difference} cents to ${event.winnerId}`);
    return {
      eventId, winnerId: event.winnerId, subscribed: true, prizeCents: difference, txnId, paidNow: true,
    };
  }

  /** All events, newest first (admin view). */
  list(): Promise<PromoEvent[]> {
    return this.prisma.promoEvent.findMany({ orderBy: { startsAt: 'desc' }, take: 100 });
  }

  /** Name and phone of each winner, so the panel can say who to congratulate. */
  async winners(events: PromoEvent[]): Promise<Map<string, { displayName: string; phone: string }>> {
    const ids = [...new Set(events.map((e) => e.winnerId).filter((id): id is string => !!id))];
    if (!ids.length) return new Map();
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, displayName: true, phone: true },
    });
    return new Map(users.map((u) => [u.id, { displayName: u.displayName, phone: u.phone }]));
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
