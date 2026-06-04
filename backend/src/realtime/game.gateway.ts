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
  ) {}

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
  onJoin(@ConnectedSocket() client: Socket, @MessageBody() body: JoinPayload): Ack {
    const user = (client.data as SocketData).user;
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
      return { ok: true, position };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  @SubscribeMessage('hand:action')
  async onAction(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { tableId: string; action: Action },
  ): Promise<Ack> {
    const user = (client.data as SocketData).user;
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
