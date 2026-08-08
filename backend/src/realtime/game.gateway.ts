import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtPayload } from '../auth/jwt-auth.guard';
import { Action } from '../poker/betting-round';
import { TableService } from './table.service';
import { PrismaService } from '../prisma/prisma.service';
import { isBlocked } from '../auth/user-status';
import { MultiTableTournamentManager, SubTableRunner } from '../tournament/multi-table-manager';
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

/**
 * Realtime poker gateway. Every connection must present a valid JWT in the
 * Socket.IO handshake (`auth.token` or an `Authorization: Bearer` header).
 * Unauthenticated sockets are disconnected immediately.
 */
@WebSocketGateway({ cors: { origin: '*' } })
export class GameGateway implements OnGatewayConnection {
  private readonly logger = new Logger('GameGateway');

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly tables: TableService,
    private readonly prisma: PrismaService,
    private readonly mtManager: MultiTableTournamentManager,
  ) {}

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
    try {
      // Money tournament room: mark the table and escrow the entry fee BEFORE
      // seating. If the wallet is short, escrow throws and the player isn't seated.
      if (body.level) {
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
      return { ok: false, error: (err as Error).message };
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
  private driveRobots(tableId: string): void {
    const table = this.tables.getTable(tableId);
    if (!table?.hand) return;
    const robotId = this.tables.robotToAct(table);
    if (!robotId) return; // a real player's turn, or no actor
    setTimeout(async () => {
      const t = this.tables.getTable(tableId);
      if (!t?.hand || t.hand.actingPlayerId !== robotId) return;
      try {
        const res = await this.tables.act(tableId, robotId, this.tables.robotDecision(t));
        if (res.complete) {
          this.server.to(room(tableId)).emit('hand:result', res.result);
          this.server.to(room(tableId)).emit('table:state', this.tables.publicState(t));
        } else {
          this.broadcastGameState(tableId);
          this.driveRobots(tableId);
        }
      } catch {
        /* ignore; a real action may have raced ahead */
      }
    }, 600);
  }

  // Deal the next hand of an in-progress tournament and broadcast each player
  // their private hole cards plus the public state.
  private continueTournament(tableId: string): void {
    const table = this.tables.getTable(tableId);
    if (!table || table.handInProgress || !this.tables.isTournament(table)) return;
    // startHand → startTournamentHand gates on ≥2 live entrants / not settled.
    if (!this.tables.startHand(table)) return;
    this.server.to(room(tableId)).emit('table:state', this.tables.publicState(table));
    for (const p of this.tables.seatedPlayers(table)) {
      const hole = this.tables.holeFor(table, p.userId);
      if (hole) this.server.to(p.socketId).emit('hand:hole', { cards: hole });
    }
    this.broadcastGameState(tableId);
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
  // play, and resolve with the winner once it busts down to one (see onAction).
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
      const table = this.tables.enableTournament(subTableId, level, 8, { subTable: true });
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
    try {
      const res = await this.tables.act(body.tableId, user.sub, body.action);
      this.logger.log(`action ${body.tableId} user=${user.sub} type=${body.action?.type} complete=${res.complete}`);
      if (res.complete) {
        this.server.to(room(body.tableId)).emit('hand:result', res.result);
        // Reflect the finished hand in the seating state.
        const table = this.tables.getTable(body.tableId);
        if (table) this.server.to(room(body.tableId)).emit('table:state', this.tables.publicState(table));

        const resolveSub = this.mtSubResolve.get(body.tableId);
        if (res.result.tournament?.over && resolveSub) {
          // A multi-table sub-table finished → alert the eliminated, then report
          // the winner to the coordinator (which advances the survivor).
          this.mtSubResolve.delete(body.tableId);
          const winnerId = res.result.tournament.winnerId!;
          const tId = this.mtSubTournament.get(body.tableId);
          const seatMap = tId ? this.mtSockets.get(tId) : undefined;
          for (const pid of this.mtSubPlayers.get(body.tableId) ?? []) {
            const sid = pid !== winnerId ? seatMap?.get(pid) : undefined;
            if (sid) this.server.to(sid).emit('tournament:eliminated', { tournamentId: tId, tableId: body.tableId });
          }
          this.mtSubTournament.delete(body.tableId);
          this.mtSubPlayers.delete(body.tableId);
          resolveSub(winnerId);
        } else if (table && this.tables.isTournament(table) && res.result.tournament && !res.result.tournament.over) {
          // Tournament that isn't over yet → deal the next hand automatically.
          setTimeout(() => this.continueTournament(body.tableId), Number(process.env.TOURNAMENT_HAND_DELAY_MS ?? '1500'));
        }
      } else {
        this.broadcastGameState(body.tableId);
        this.driveRobots(body.tableId); // if the next actor is a robot
      }
      return { ok: true };
    } catch (err) {
      this.logger.warn(`action REJECTED ${body.tableId} user=${user.sub} type=${body.action?.type}: ${(err as Error).message}`);
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
  onLeave(@ConnectedSocket() client: Socket, @MessageBody() body: { tableId: string }): Ack {
    const user = (client.data as SocketData).user;
    const table = this.tables.leave(body.tableId, user.sub);
    client.leave(room(body.tableId));
    if (table) {
      this.server.to(room(body.tableId)).emit('table:state', this.tables.publicState(table));
    }
    return { ok: true };
  }

  private broadcastGameState(tableId: string): void {
    const table = this.tables.getTable(tableId);
    if (!table) return;
    const state = this.tables.gameState(table);
    if (state) this.server.to(room(tableId)).emit('game:state', state);
  }
}
