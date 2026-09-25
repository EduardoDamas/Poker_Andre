import { Logger, OnModuleDestroy } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtPayload } from '../auth/jwt-auth.guard';
import { Action } from '../poker/betting-round';
import { HandResultPayload, TableService } from './table.service';
import { PrismaService } from '../prisma/prisma.service';
import { isBlocked } from '../auth/user-status';
import { PlayerLimitService } from '../responsible/player-limit.service';
import { MultiTableTournamentManager, SubTableRunner } from '../tournament/multi-table-manager';
import { MttTable, SEATS_PER_TABLE } from '../tournament/multi-table';
import { PromoService, promoEventIdOf, promoOpensAt } from '../promo/promo.service';
import { promoTime, promoWhenLong } from '../promo/promo-format';
import { PromoBracket, PromoBrackets } from '../promo/promo-bracket';
import { Subscription } from '../tournament/subscription';

const room = (tableId: string) => `table:${tableId}`;

interface JoinPayload {
  tableId: string;
  maxSeats?: number;
  // When set, this is a MONEY tournament room of the given level (1..7): the
  // entry fee (V.I.) is escrowed on join and the winner is paid the prize.
  level?: number;
}
interface Ack {
  ok: boolean;
  position?: number;
  error?: string;
}

// The authenticated user is attached here after a successful handshake.
export interface SocketData {
  user: JwtPayload;
}

const handDelay = () => Number(process.env.TOURNAMENT_HAND_DELAY_MS ?? '1500');
/** How long a bracket player has to act before the table checks/folds for them. */
const turnMs = () => Number(process.env.TURN_TIMEOUT_MS ?? '30000');
/** Pause between a bracket round's last table and the next round's deal. */
const roundDelay = () => Number(process.env.BRACKET_ROUND_DELAY_MS ?? '5000');
/** How long a disconnected player keeps their place in a running tournament. */
const disconnectGrace = () => Number(process.env.TOURNAMENT_DISCONNECT_GRACE_MS ?? '60000');

/**
 * Realtime poker gateway. Every connection must present a valid JWT in the
 * Socket.IO handshake (`auth.token` or an `Authorization: Bearer` header).
 * Unauthenticated sockets are disconnected immediately.
 */
@WebSocketGateway({ cors: { origin: '*' } })
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy {
  private readonly logger = new Logger('GameGateway');

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly tables: TableService,
    private readonly prisma: PrismaService,
    private readonly mtManager: MultiTableTournamentManager,
    private readonly limits: PlayerLimitService,
    private readonly promo: PromoService,
    private readonly brackets: PromoBrackets,
  ) {}

  // Promotion rooms: the clock checks that may start them, and rooms mid-start.
  private readonly promoTimers = new Map<string, NodeJS.Timeout[]>();
  private readonly promoStarting = new Set<string>();
  // Bracket tables: the running turn clock, one per table.
  private readonly turnTimers = new Map<string, NodeJS.Timeout>();

  // --- Multi-table tournament live state ---
  // tournamentId → (userId → socketId), so we can move players between sub-tables.
  private readonly mtSockets = new Map<string, Map<string, string>>();
  // tournamentId → level, remembered from registration.
  private readonly mtLevel = new Map<string, number>();
  // sub-tableId → resolve(winnerId): fulfils the SubTableRunner promise when the
  // sub-table busts down to one player.
  private readonly mtSubResolve = new Map<string, (winnerId: string) => void>();
  // sub-tableId → tournamentId and → its players (to alert the eliminated).
  private readonly mtSubTournament = new Map<string, string>();
  private readonly mtSubPlayers = new Map<string, string[]>();
  // tournamentIds that have already been started (so registration can't re-trigger).
  private readonly mtStarted = new Set<string>();

  onModuleDestroy(): void {
    for (const timers of this.promoTimers.values()) timers.forEach(clearTimeout);
    this.turnTimers.forEach(clearTimeout);
  }

  // Backend validation: a blocked user cannot join/play, even via direct calls.
  private async _blocked(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    return !user || isBlocked(user);
  }

  // The player's effective subscription tier (reverts to NONE past expiry).
  private async _subscriptionOf(userId: string): Promise<'NONE' | 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL'> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return 'NONE';
    if (user.subscription === 'NONE') return 'NONE';
    if (user.subscriptionUntil && user.subscriptionUntil.getTime() < Date.now()) return 'NONE';
    return user.subscription;
  }

  async handleConnection(client: Socket): Promise<void> {
    const token = this.extractToken(client);
    if (!token) return this.reject(client, 'Missing token.');

    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token);
      (client.data as SocketData).user = payload;
      client.emit('connected', { userId: payload.sub });
      this.logger.log(`Socket ${client.id} authenticated as ${payload.sub}`);
    } catch {
      this.reject(client, 'Invalid or expired token.');
    }
  }

  handleDisconnect(client: Socket): void {
    // Free ghost seats (app killed / connection dropped) so the lobby count is
    // honest. Live money-tournament seats are kept for rejoin — see
    // TableService.vacateDisconnected.
    for (const table of this.tables.vacateDisconnected(client.id)) {
      this.server.to(room(table.id)).emit('table:state', this.tables.publicState(table));
    }
    // Promotion rooms: before the start a dropped connection frees its place;
    // afterwards the player is marked away until they come back.
    for (const bracket of this.brackets.all()) {
      if (bracket.dropSocket(client.id).length && !bracket.started) this.broadcastLobby(bracket);
    }
    // Live money games: give the player a grace window to reconnect; if the
    // same dead socket still holds the seat afterwards, withdraw them exactly
    // as an explicit "Sair da mesa" would (fold → revert/continue, honest
    // occupancy). A rejoin rebinds the seat to a NEW socket id, which cancels
    // this naturally.
    for (const { tableId, userId } of this.tables.liveSeatsOf(client.id)) {
      setTimeout(() => {
        const table = this.tables.getTable(tableId);
        const seat = table?.seats.find((s) => s?.userId === userId);
        if (!seat || seat.socketId !== client.id) return; // rejoined or already left
        this.logger.log(`disconnect grace expired: withdrawing ${userId} from ${tableId}`);
        void this.settleLeave(tableId, userId);
      }, disconnectGrace());
    }
  }

  private extractToken(client: Socket): string | null {
    const fromAuth = (client.handshake.auth as { token?: string } | undefined)?.token;
    if (fromAuth) return fromAuth;
    const header = client.handshake.headers.authorization;
    if (header?.startsWith('Bearer ')) return header.slice('Bearer '.length);
    return null;
  }

  private reject(client: Socket, message: string): void {
    client.emit('unauthorized', { message });
    client.disconnect(true);
  }

  @SubscribeMessage('table:join')
  async onJoin(@ConnectedSocket() client: Socket, @MessageBody() body: JoinPayload): Promise<Ack> {
    const user = (client.data as SocketData).user;
    if (await this._blocked(user.sub)) return { ok: false, error: 'Conta bloqueada.' };
    // A bracket's tables are seated by the server, never joined directly.
    if (this.brackets.forTable(body.tableId) || this.mtSubTournament.has(body.tableId)) {
      return { ok: false, error: 'Mesa reservada aos participantes do torneio.' };
    }
    const promoEventId = promoEventIdOf(body.tableId);
    if (promoEventId) return this.joinPromo(client, user.sub, body.tableId, promoEventId);
    try {
      // Money tournament room: mark the table and escrow the entry fee BEFORE
      // seating. If the wallet is short, escrow throws and the player isn't seated.
      if (body.level) {
        // Self-exclusion blocks money games; free/practice tables stay open.
        if (await this.limits.isSelfExcluded(user.sub)) {
          return { ok: false, error: 'Você está em autoexclusão. Jogos a dinheiro estão bloqueados.' };
        }
        const t = this.tables.enableTournament(body.tableId, body.level, body.maxSeats);
        const sub = await this._subscriptionOf(user.sub);
        await this.tables.enterTournament(t, user.sub, sub);
      }

      const { table, position, rejoined } = this.tables.join(
        body.tableId, user.sub, client.id, body.maxSeats);
      client.join(room(body.tableId));

      const started = this.tables.isTournament(table)
        ? this.tables.tournamentReadyToStart(table) && this.tables.startHand(table)
        : !table.handInProgress && this.tables.seatedCount(table) >= 2
          ? this.tables.startHand(table)
          : false;

      // Public state to the whole room — never contains hole cards.
      this.server.to(room(body.tableId)).emit('table:state', this.tables.publicState(table));

      if (started) {
        // Private hole cards: delivered only to each owner's own socket.
        for (const p of this.tables.seatedPlayers(table)) {
          const hole = this.tables.holeFor(table, p.userId);
          if (hole) this.server.to(p.socketId).emit('hand:hole', { cards: hole });
        }
        this.broadcastGameState(body.tableId);
      } else if (rejoined && table.handInProgress) {
        // A returning player re-binds: replay their private view.
        const hole = this.tables.holeFor(table, user.sub);
        if (hole) client.emit('hand:hole', { cards: hole });
        const state = this.tables.gameState(table);
        if (state) client.emit('game:state', state);
      }
      this.logger.log(
        `join ${body.tableId} user=${user.sub} rejoined=${rejoined} seated=${this.tables.seatedCount(table)} started=${started} inProgress=${table.handInProgress}`,
      );

      if (started) {
        // The first actor may be a robot (e.g. you are BB, a robot is SB).
        this.driveRobots(body.tableId);
      } else if (
        process.env.ROBOTS_FILL === '1' &&
        !this.tables.isTournament(table) && // robots never join money tournaments
        !table.handInProgress &&
        this.tables.realPlayerCount(table) === 1
      ) {
        // A real player is waiting alone → fill with robots so the match starts.
        setTimeout(() => this.fillAndStart(body.tableId), 1500);
      }
      return { ok: true, position };
    } catch (err) {
      const msg = (err as Error).message;
      this.logger.warn(`join FAILED table=${body.tableId} user=${user.sub}: ${msg}`);
      return { ok: false, error: msg };
    }
  }

  // Fill the room with robots and start a hand (only if a lone real player is
  // still waiting). Robot matches deduct nothing (handled in TableService).
  private fillAndStart(tableId: string): void {
    const table = this.tables.getTable(tableId);
    if (!table || table.handInProgress || this.tables.realPlayerCount(table) !== 1) return;
    this.tables.fillWithRobots(table);
    if (!this.tables.startHand(table)) return;
    this.server.to(room(tableId)).emit('table:state', this.tables.publicState(table));
    for (const p of this.tables.seatedPlayers(table)) {
      const hole = this.tables.holeFor(table, p.userId);
      if (hole && !p.userId.startsWith('robot')) this.server.to(p.socketId).emit('hand:hole', { cards: hole });
    }
    this.broadcastGameState(tableId);
    this.driveRobots(tableId);
  }

  // Drive consecutive robot turns (with a short delay), broadcasting state.
  // Advance the hand when the actor is not a live human: a robot plays its
  // decision; a player who LEFT the table (empty seat) is auto-folded so the
  // remaining players keep competing.
  private driveRobots(tableId: string): void {
    const table = this.tables.getTable(tableId);
    if (!table?.hand) return;
    const actorId = this.tables.robotToAct(table) ?? this.tables.absentToAct(table);
    if (!actorId) return; // a live player's turn, or no actor
    setTimeout(() => {
      const t = this.tables.getTable(tableId);
      if (!t?.hand || t.hand.actingPlayerId !== actorId) return;
      const action =
        this.tables.robotToAct(t) === actorId ? this.tables.robotDecision(t) : ({ type: 'fold' } as Action);
      void this.autoAct(tableId, actorId, action);
    }, 600);
  }

  /** Act for someone who is not acting themselves (robot, absent, out of time). */
  private async autoAct(tableId: string, actorId: string, action: Action): Promise<void> {
    try {
      const res = await this.tables.act(tableId, actorId, action);
      if (res.complete) {
        await this.afterHand(tableId, res.result);
      } else {
        this.broadcastGameState(tableId);
        this.driveRobots(tableId);
      }
    } catch {
      /* ignore; a real action may have raced ahead */
    }
  }

  /**
   * Everything that follows a finished hand, whichever way it finished — a
   * player's action, a robot, an absent player's auto-fold, a timeout or a
   * withdrawal. One place, so no path can forget to advance a tournament.
   */
  private async afterHand(tableId: string, result: HandResultPayload): Promise<void> {
    const bracket = this.brackets.forTable(tableId);
    if (bracket) return this.afterBracketHand(bracket, tableId, result);

    const table = this.tables.getTable(tableId);
    this.server.to(room(tableId)).emit('hand:result', result);
    // Reflect the finished hand in the seating state.
    if (table) this.server.to(room(tableId)).emit('table:state', this.tables.publicState(table));

    const resolveSub = this.mtSubResolve.get(tableId);
    if (result.tournament?.over && resolveSub) {
      // A multi-table sub-table finished → alert the eliminated, then report
      // the winner to the coordinator (which advances the survivor).
      this.mtSubResolve.delete(tableId);
      const winnerId = result.tournament.winnerId!;
      const tId = this.mtSubTournament.get(tableId);
      const seatMap = tId ? this.mtSockets.get(tId) : undefined;
      for (const pid of this.mtSubPlayers.get(tableId) ?? []) {
        const sid = pid !== winnerId ? seatMap?.get(pid) : undefined;
        if (sid) this.server.to(sid).emit('tournament:eliminated', { tournamentId: tId, tableId });
      }
      this.mtSubTournament.delete(tableId);
      this.mtSubPlayers.delete(tableId);
      resolveSub(winnerId);
    } else if (result.tournament?.reverted) {
      // Opponents withdrew — no payout; show "waiting" after the banner.
      setTimeout(() => this.server.to(room(tableId)).emit('table:waiting', {}), 1800);
    } else if (table && this.tables.isTournament(table) && result.tournament && !result.tournament.over) {
      // Tournament that isn't over yet → deal the next hand automatically.
      setTimeout(() => this.continueTournament(tableId), handDelay());
    } else if (result.tournament?.over) {
      // Settled — free the room so the next group starts fresh (0/8).
      this.tables.resetSettled(tableId);
    }
  }

  // Deal the next hand of an in-progress tournament and broadcast each player
  // their private hole cards plus the public state.
  private continueTournament(tableId: string): void {
    const table = this.tables.getTable(tableId);
    if (!table || table.handInProgress || !this.tables.isTournament(table)) return;
    // startHand → startTournamentHand gates on ≥2 live entrants / not settled.
    if (!this.tables.startHand(table)) return;
    this.announceHand(tableId);
    this.driveRobots(tableId); // an absent player may be first to act
  }

  /** Broadcast a freshly dealt hand: public state, private hole cards, turn. */
  private announceHand(tableId: string): void {
    const table = this.tables.getTable(tableId);
    if (!table) return;
    this.server.to(room(tableId)).emit('table:state', this.tables.publicState(table));
    for (const p of this.tables.seatedPlayers(table)) {
      const hole = this.tables.holeFor(table, p.userId);
      if (hole) this.server.to(p.socketId).emit('hand:hole', { cards: hole });
    }
    this.broadcastGameState(tableId);
  }

  // --- Promotions: a free multi-table bracket with one company-paid prize ---
  //
  // Client, 2026-09-22: tables of 8 play down to one winner each, the winners
  // meet at a final table, one champion wins R$250 (R$500 if a subscriber at
  // the start). Up to 100 places (10 tables of up to 10 → a final of 10).
  //
  // The installed app (1.0.7) knows nothing of brackets: it joins the promo
  // room and sends every action with the promo room's id. The server routes
  // each player to their current table, so that app plays the whole bracket.

  private async joinPromo(client: Socket, userId: string, roomId: string, eventId: string): Promise<Ack> {
    try {
      const running = this.brackets.get(roomId);
      if (running?.started) return this.rejoinBracket(client, userId, running);
      // Free entry, but a cash prize: self-exclusion applies here too.
      if (await this.limits.isSelfExcluded(userId)) {
        return { ok: false, error: 'Você está em autoexclusão. Jogos a dinheiro estão bloqueados.' };
      }
      const event = await this.promo.openEvent(eventId);
      if (!event) return { ok: false, error: await this.promoClosedReason(eventId) };
      const bracket = this.brackets.getOrCreate({
        eventId: event.id,
        roomId,
        startsAt: event.startsAt,
        minPlayers: Math.max(2, event.minPlayers),
        maxPlayers: event.maxPlayers,
        waitMinutes: event.waitMinutes,
      });
      if (bracket.started) return this.rejoinBracket(client, userId, bracket);
      const subscription = await this._subscriptionOf(userId);
      bracket.register(userId, client.id, subscription);
      client.join(room(roomId));
      this.broadcastLobby(bracket);
      this.schedulePromoChecks(bracket);
      this.logger.log(`promo ${roomId}: ${userId} holds a place (${bracket.registered}/${bracket.config.maxPlayers})`);
      await this.startPromoIfReady(bracket);
      return { ok: true, position: bracket.registered };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  /** Why a promotion room is closed: too early says when to come back. */
  private async promoClosedReason(eventId: string): Promise<string> {
    const event = await this.promo.find(eventId);
    if (event?.status === 'SCHEDULED' && Date.now() < promoOpensAt(event).getTime()) {
      return (
        `A sala do torneio abre às ${promoTime(promoOpensAt(event))} e o torneio começa ` +
        `${promoWhenLong(event.startsAt)}. Volte nesse horário!`
      );
    }
    return 'Esta promoção não está disponível agora.';
  }

  /** A player of a running bracket came back: put them back at their table. */
  private rejoinBracket(client: Socket, userId: string, bracket: PromoBracket): Ack {
    if (bracket.finished) return { ok: false, error: 'Este torneio já terminou.' };
    if (!bracket.entrant(userId)) return { ok: false, error: 'O torneio da promoção já começou.' };
    if (!bracket.isAlive(userId)) return { ok: false, error: 'Você foi eliminado deste torneio.' };
    bracket.rebind(userId, client.id);
    client.join(room(bracket.roomId));
    const tableId = bracket.tableOf(userId);
    const table = tableId ? this.tables.getTable(tableId) : undefined;
    if (!tableId || !table) return { ok: true };

    if (table.tournament?.settled) {
      // They won their table and wait for the others.
      client.emit('tournament:advanced', this.advancedState(bracket));
      return { ok: true };
    }
    try {
      this.tables.join(tableId, userId, client.id); // re-bind, or take a seat if never seated
    } catch {
      /* already bound to this socket */
    }
    client.join(room(tableId));
    client.emit('tournament:table', this.tableState(bracket, tableId));
    client.emit('table:state', this.tables.publicState(table));
    const hole = this.tables.holeFor(table, userId);
    if (hole) client.emit('hand:hole', { cards: hole });
    const state = this.tables.gameState(table);
    if (state) client.emit('game:state', state);
    return { ok: true };
  }

  private lobbyState(bracket: PromoBracket) {
    return {
      tournamentId: bracket.roomId,
      registered: bracket.registered,
      minPlayers: bracket.config.minPlayers,
      maxPlayers: bracket.config.maxPlayers,
      startsAt: bracket.config.startsAt.toISOString(),
      startAnywayAt: bracket.startAnywayAt?.toISOString() ?? null,
    };
  }

  private broadcastLobby(bracket: PromoBracket): void {
    this.server.to(room(bracket.roomId)).emit('promo:lobby', this.lobbyState(bracket));
  }

  private tableState(bracket: PromoBracket, tableId: string) {
    return {
      tournamentId: bracket.roomId,
      tableId,
      round: bracket.round,
      final: bracket.isFinal(tableId),
      alive: bracket.aliveCount,
    };
  }

  private advancedState(bracket: PromoBracket) {
    return { tournamentId: bracket.roomId, round: bracket.round, tablesLeft: bracket.tablesLeft() };
  }

  private emitToPlayer(bracket: PromoBracket, userId: string, event: string, payload: unknown): void {
    const e = bracket.entrant(userId);
    if (e?.connected) this.server.to(e.socketId).emit(event, payload);
  }

  /** Arm the clock checks (start time, end of tolerance) that may start it. */
  private schedulePromoChecks(bracket: PromoBracket): void {
    if (this.promoTimers.has(bracket.roomId)) return;
    const now = Date.now();
    const timers = bracket
      .startChecks(now)
      .map((at) => setTimeout(() => void this.startPromoIfReady(bracket), at - now + 50));
    this.promoTimers.set(bracket.roomId, timers);
  }

  /**
   * Start the bracket if it may (see PromoBracket.shouldStart). Subscriptions
   * are re-read first — the rule is "assinante até o início do torneio", so
   * someone who subscribed while waiting counts.
   */
  private async startPromoIfReady(bracket: PromoBracket): Promise<boolean> {
    if (!bracket.shouldStart(Date.now()) || this.promoStarting.has(bracket.roomId)) return false;
    this.promoStarting.add(bracket.roomId);
    try {
      if (!(await this.promo.openEvent(bracket.eventId))) return false; // cancelled meanwhile
      const subs = new Map<string, Subscription>();
      for (const id of bracket.entrantIds()) subs.set(id, await this._subscriptionOf(id));
      // Re-check: players may have left while we were reading.
      if (!bracket.shouldStart(Date.now())) return false;
      const tables = bracket.start(subs);
      this.promoTimers.get(bracket.roomId)?.forEach(clearTimeout);
      void this.promo
        .markStarted(bracket.eventId, bracket.startedAt!, bracket.startedWith)
        .catch((e) => this.logger.error(`promo ${bracket.roomId}: start not recorded: ${(e as Error).message}`));
      this.logger.log(`promo ${bracket.roomId}: started with ${bracket.startedWith} players on ${tables.length} tables`);
      this.server
        .to(room(bracket.roomId))
        .emit('promo:started', { tournamentId: bracket.roomId, players: bracket.startedWith, tables: tables.length });
      this.openBracketRound(bracket, tables);
      return true;
    } finally {
      this.promoStarting.delete(bracket.roomId);
    }
  }

  /** Seat a round's tables and deal their first hands. */
  private openBracketRound(bracket: PromoBracket, round: MttTable[]): void {
    for (const mt of round) {
      this.brackets.indexTable(mt.id, bracket.roomId);
      // Tables of 8; up to 10 at a final table or in a 81–100 field.
      const table = this.tables.enableTournament(mt.id, 0, Math.max(SEATS_PER_TABLE, mt.players.length), {
        subTable: true,
      });
      for (const pid of mt.players) {
        this.tables.recordTournamentEntry(table, pid, bracket.subscriptionOf(pid));
        const e = bracket.entrant(pid);
        if (!e?.connected) {
          // Away: dealt in and auto-folded; withdrawn if not back in time.
          this.scheduleAbsentWithdrawal(bracket, mt.id, pid);
          continue;
        }
        try {
          this.tables.join(mt.id, pid, e.socketId);
        } catch {
          /* already seated */
        }
        this.server.sockets.sockets.get(e.socketId)?.join(room(mt.id));
        this.server.to(e.socketId).emit('tournament:table', this.tableState(bracket, mt.id));
      }
      if (this.tables.startHand(table)) {
        this.announceHand(mt.id);
        this.driveRobots(mt.id);
      }
    }
  }

  private scheduleAbsentWithdrawal(bracket: PromoBracket, tableId: string, userId: string): void {
    setTimeout(() => {
      const e = bracket.entrant(userId);
      if (!e || e.connected || bracket.tableOf(userId) !== tableId) return; // back, or already out
      this.logger.log(`promo ${bracket.roomId}: ${userId} never came back — withdrawn from ${tableId}`);
      void this.settleLeave(tableId, userId);
    }, disconnectGrace());
  }

  /** A bracket table finished a hand: knockouts, table winners, next round, prize. */
  private async afterBracketHand(bracket: PromoBracket, tableId: string, result: HandResultPayload): Promise<void> {
    const status = result.tournament;
    const table = this.tables.getTable(tableId);
    const busted = (status?.busted ?? []).filter((id) => bracket.isAlive(id));
    if (busted.length) {
      const place = bracket.knockOut(busted);
      for (const id of busted) {
        this.emitToPlayer(bracket, id, 'tournament:eliminated', {
          tournamentId: bracket.roomId, tableId, place, players: bracket.startedWith,
        });
      }
    }

    if (!status?.over || !status.winnerId) {
      this.server.to(room(tableId)).emit('hand:result', result);
      if (table) this.server.to(room(tableId)).emit('table:state', this.tables.publicState(table));
      setTimeout(() => this.continueTournament(tableId), handDelay());
      return;
    }

    const winnerId = status.winnerId;
    if (bracket.isFinal(tableId)) {
      // The champion. Pay first, so the result can show the prize.
      bracket.tableWon(tableId, winnerId);
      const prizeCents = await this.payPromoPrize(bracket, winnerId);
      this.server.to(room(tableId)).emit('hand:result', { ...result, tournament: { ...status, prizeCents } });
      if (table) this.server.to(room(tableId)).emit('table:state', this.tables.publicState(table));
      this.server
        .to(room(bracket.roomId))
        .emit('tournament:champion', { tournamentId: bracket.roomId, winnerId, prizeCents });
      this.logger.log(`promo ${bracket.roomId}: champion ${winnerId} (${prizeCents ?? 'unpaid'} cents)`);
      return;
    }

    // An earlier round's table: its winner advances. The app sees an ordinary
    // hand result ("over" is only true for the whole tournament).
    this.server.to(room(tableId)).emit('hand:result', {
      ...result,
      tournament: { over: false, remaining: 1, busted: status.busted ?? [], tableWinnerId: winnerId },
    });
    if (table) this.server.to(room(tableId)).emit('table:state', this.tables.publicState(table));
    const outcome = bracket.tableWon(tableId, winnerId);
    if (outcome.nextRound) {
      this.emitToPlayer(bracket, winnerId, 'tournament:advanced', {
        tournamentId: bracket.roomId, round: bracket.round - 1, tablesLeft: 0,
      });
      const next = outcome.nextRound;
      setTimeout(() => this.openBracketRound(bracket, next), roundDelay());
    } else {
      for (const id of bracket.waitingWinners()) {
        this.emitToPlayer(bracket, id, 'tournament:advanced', this.advancedState(bracket));
      }
    }
  }

  /**
   * The company-funded prize. The subscriber rate applies to a plan active at
   * the start, or asked for before it and released by now (plans are released
   * by hand). A failure (e.g. blocked winner) holds the prize for review.
   */
  private async payPromoPrize(bracket: PromoBracket, winnerId: string): Promise<number | undefined> {
    try {
      const subscribedAtStart =
        bracket.subscribedAtStart(winnerId) ||
        (await this.promo.subscribedByRequestAt(winnerId, bracket.startedAt ?? new Date()));
      const payout = await this.promo.awardPrize({ eventId: bracket.eventId, winnerId, subscribedAtStart });
      return Number(payout.prizeCents);
    } catch (e) {
      this.logger.error(`promo prize for ${bracket.roomId} not paid: ${(e as Error).message}`);
      return undefined;
    }
  }

  /** Bracket tables run a turn clock: out of time → check if free, else fold. */
  private armTurnClock(tableId: string): void {
    clearTimeout(this.turnTimers.get(tableId));
    this.turnTimers.delete(tableId);
    const hand = this.tables.getTable(tableId)?.hand;
    const actorId = hand?.actingPlayerId;
    if (!hand || !actorId) return;
    this.turnTimers.set(
      tableId,
      setTimeout(() => {
        this.turnTimers.delete(tableId);
        const t = this.tables.getTable(tableId);
        if (t?.hand !== hand || hand.actingPlayerId !== actorId) return; // they acted
        const action: Action = hand.legalActions().includes('check') ? { type: 'check' } : { type: 'fold' };
        void this.autoAct(tableId, actorId, action);
      }, turnMs()),
    );
  }

  // --- Multi-table tournament (shootout) ---

  @SubscribeMessage('tournament:register')
  async onTournamentRegister(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { tournamentId: string; level: number },
  ): Promise<Ack> {
    const user = (client.data as SocketData).user;
    if (await this._blocked(user.sub)) return { ok: false, error: 'Conta bloqueada.' };
    if (this.mtStarted.has(body.tournamentId)) return { ok: false, error: 'Torneio já começou.' };
    // Map the socket up front — BEFORE the async escrow — so every registered
    // player's socket is known the instant the tournament starts (otherwise a
    // player can be in the bracket but unseatable, stalling their sub-table).
    const socks = this.mtSockets.get(body.tournamentId) ?? new Map<string, string>();
    socks.set(user.sub, client.id);
    this.mtSockets.set(body.tournamentId, socks);
    this.mtLevel.set(body.tournamentId, body.level);
    try {
      const sub: Subscription = await this._subscriptionOf(user.sub);
      const count = await this.mtManager.register(body.tournamentId, body.level, user.sub, sub);
      client.emit('tournament:registered', { tournamentId: body.tournamentId, count });

      const startSize = Number(process.env.TOURNAMENT_START_SIZE ?? '80');
      if (count >= startSize && !this.mtStarted.has(body.tournamentId)) {
        this.startTournament(body.tournamentId, body.level, startSize);
      }
      return { ok: true, position: count };
    } catch (err) {
      socks.delete(user.sub); // registration failed → drop the socket mapping
      return { ok: false, error: (err as Error).message };
    }
  }

  // Kick off the bracket. The manager drives the rounds; each sub-table is played
  // live via playSubTable. On a champion, the winner is alerted and state cleared.
  private startTournament(tournamentId: string, level: number, minPlayers: number): void {
    if (this.mtStarted.has(tournamentId)) return; // idempotent — only start once
    this.mtStarted.add(tournamentId);
    const runner: SubTableRunner = {
      play: (subTableId, lvl, players) => this.playSubTable(tournamentId, subTableId, lvl, players),
    };
    this.mtManager
      .start(tournamentId, level, runner, { minPlayers })
      .then(({ championId, payout }) => {
        const champSock = this.mtSockets.get(tournamentId)?.get(championId);
        if (champSock) {
          this.server
            .to(champSock)
            .emit('tournament:champion', { tournamentId, prizeCents: Number(payout.winnerCents) });
        }
      })
      .catch((err) => this.logger.error(`tournament ${tournamentId}: ${(err as Error).message}`))
      .finally(() => {
        this.mtSockets.delete(tournamentId);
        this.mtLevel.delete(tournamentId);
        this.mtStarted.delete(tournamentId);
      });
  }

  // SubTableRunner: open a chips-only sub-table, seat the players' sockets, start
  // play, and resolve with the winner once it busts down to one (see afterHand).
  private playSubTable(
    tournamentId: string,
    subTableId: string,
    level: number,
    players: string[],
  ): Promise<string> {
    return new Promise<string>((resolve) => {
      this.mtSubResolve.set(subTableId, resolve);
      this.mtSubTournament.set(subTableId, tournamentId);
      this.mtSubPlayers.set(subTableId, players);
      // A final table seats everyone who reached it (up to 10); others seat 8.
      const seats = Math.max(SEATS_PER_TABLE, players.length);
      const table = this.tables.enableTournament(subTableId, level, seats, { subTable: true });
      const socks = this.mtSockets.get(tournamentId);
      for (const pid of players) {
        this.tables.recordTournamentEntry(table, pid, 'NONE'); // chips; entry already escrowed
        const sid = socks?.get(pid);
        if (!sid) continue;
        try {
          this.tables.join(subTableId, pid, sid); // seat for display + hole-card delivery
        } catch {
          /* already seated */
        }
        this.server.sockets.sockets.get(sid)?.join(room(subTableId));
        this.server.to(sid).emit('tournament:table', { tournamentId, tableId: subTableId, level });
      }

      if (this.tables.startHand(table)) {
        this.server.to(room(subTableId)).emit('table:state', this.tables.publicState(table));
        for (const p of this.tables.seatedPlayers(table)) {
          const sid = socks?.get(p.userId);
          const hole = this.tables.holeFor(table, p.userId);
          if (sid && hole) this.server.to(sid).emit('hand:hole', { cards: hole });
        }
        this.broadcastGameState(subTableId);
        this.driveRobots(subTableId);
      }
    });
  }

  @SubscribeMessage('hand:action')
  async onAction(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { tableId: string; action: Action },
  ): Promise<Ack> {
    const user = (client.data as SocketData).user;
    if (await this._blocked(user.sub)) return { ok: false, error: 'Conta bloqueada.' };
    // A promotion player acts under the promo room's id; play at their table.
    const tableId = this.brackets.get(body.tableId)?.tableOf(user.sub) ?? body.tableId;
    try {
      const res = await this.tables.act(tableId, user.sub, body.action);
      this.logger.log(`action ${tableId} user=${user.sub} type=${body.action?.type} complete=${res.complete}`);
      if (res.complete) {
        await this.afterHand(tableId, res.result);
      } else {
        this.broadcastGameState(tableId);
        this.driveRobots(tableId); // if the next actor is a robot
      }
      return { ok: true };
    } catch (err) {
      this.logger.warn(`action REJECTED ${tableId} user=${user.sub} type=${body.action?.type}: ${(err as Error).message}`);
      return { ok: false, error: (err as Error).message };
    }
  }

  @SubscribeMessage('table:rejoin')
  onRejoin(@ConnectedSocket() client: Socket, @MessageBody() body: { tableId: string }): Ack {
    const user = (client.data as SocketData).user;
    try {
      const { table, position } = this.tables.reconnect(body.tableId, user.sub, client.id);
      client.join(room(body.tableId));

      // Restore this player's full view — to this socket only.
      client.emit('table:state', this.tables.publicState(table));
      const hole = this.tables.holeFor(table, user.sub);
      if (hole) client.emit('hand:hole', { cards: hole });
      const state = this.tables.gameState(table);
      if (state) client.emit('game:state', state);

      return { ok: true, position };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  @SubscribeMessage('table:leave')
  async onLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { tableId: string },
  ): Promise<Ack> {
    const user = (client.data as SocketData).user;
    client.leave(room(body.tableId)); // before the emits: the leaver gets nothing
    const bracket = this.brackets.get(body.tableId);
    if (bracket) {
      if (!bracket.started) {
        // Gave the place back before the start.
        if (bracket.leave(user.sub)) this.broadcastLobby(bracket);
        return { ok: true };
      }
      const tableId = bracket.tableOf(user.sub);
      if (!tableId) return { ok: true }; // already out
      client.leave(room(tableId));
      await this.settleLeave(tableId, user.sub);
      return { ok: true };
    }
    await this.settleLeave(body.tableId, user.sub);
    return { ok: true };
  }

  /**
   * Withdraw [userId] from [tableId] and broadcast the aftermath. Shared by the
   * explicit "Sair da mesa" and the disconnect grace timer.
   */
  private async settleLeave(tableId: string, userId: string): Promise<void> {
    const res = await this.tables.leave(tableId, userId);
    if (!res) return;
    const { table, result } = res;
    const bracket = this.brackets.forTable(tableId);
    if (bracket && res.withdrew && bracket.isAlive(userId)) bracket.knockOut([userId]);

    this.server.to(room(tableId)).emit('table:state', this.tables.publicState(table));

    if (res.reverted) {
      // Everyone else withdrew between hands — back to "waiting for players".
      this.server.to(room(tableId)).emit('table:waiting', {});
    }

    if (result) {
      // The withdrawal ended the hand — the remaining players see the result.
      this.logger.log(
        `leave ${tableId} user=${userId} → result over=${result.tournament?.over} reverted=${result.tournament?.reverted}`,
      );
      await this.afterHand(tableId, result);
    } else if (table.handInProgress) {
      // The hand goes on without the leaver; if the action already sits on
      // their empty seat (or a robot), drive it.
      this.broadcastGameState(tableId);
      this.driveRobots(tableId);
    }
  }

  private broadcastGameState(tableId: string): void {
    const table = this.tables.getTable(tableId);
    if (!table) return;
    const state = this.tables.gameState(table);
    if (!state) return;
    if (this.brackets.forTable(tableId)) {
      // Promotion tables play against the clock; the app can show it.
      this.server.to(room(tableId)).emit('game:state', { ...state, turnMs: turnMs() });
      this.armTurnClock(tableId);
      return;
    }
    this.server.to(room(tableId)).emit('game:state', state);
  }
}
