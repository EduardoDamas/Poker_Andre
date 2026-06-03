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
      const { table, position } = this.tables.join(body.tableId, user.sub, client.id, body.maxSeats);
      client.join(room(body.tableId));

      const started = this.tables.startHandIfReady(table);

      // Public state to the whole room — never contains hole cards.
      this.server.to(room(body.tableId)).emit('table:state', this.tables.publicState(table));

      // Private hole cards: delivered only to each owner's own socket.
      if (started) {
        for (const p of this.tables.seatedPlayers(table)) {
          if (p.hole) this.server.to(p.socketId).emit('hand:hole', { cards: p.hole });
        }
      }
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
}
