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

const room = (tableId: string) => `table:${tableId}`;

interface JoinPayload {
  tableId: string;
  maxSeats?: number;
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
  ) {}

  // Backend validation: a blocked user cannot join/play, even via direct calls.
  private async _blocked(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    return !user || isBlocked(user);
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
      const { table, position, rejoined } = this.tables.join(
        body.tableId, user.sub, client.id, body.maxSeats);
      client.join(room(body.tableId));

      const started =
        !table.handInProgress && this.tables.seatedCount(table) >= 2
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
