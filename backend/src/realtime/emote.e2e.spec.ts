import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { AddressInfo } from 'net';
import { PrismaClient } from '@prisma/client';
import { io as ioClient, Socket } from 'socket.io-client';
import { AppModule } from '../app.module';

/**
 * Quick reactions at the table (client, 2026-10): a fixed set, from seated
 * players only, to everyone at that table, at most one every few seconds.
 */
describe('Table emotes (e2e)', () => {
  let app: INestApplication;
  let jwt: JwtService;
  let prisma: PrismaClient;
  let url: string;
  const sockets: Socket[] = [];
  let n = 0;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0);
    jwt = app.get(JwtService);
    prisma = new PrismaClient();
    url = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    sockets.forEach((s) => s.close());
    await prisma.$disconnect();
    await app.close();
  });

  async function connect(userId: string): Promise<Socket> {
    n += 1;
    await prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: {
        id: userId,
        phone: `+551590070${n.toString().padStart(4, '0')}`,
        displayName: userId,
        cpf: `90070000${n.toString().padStart(3, '0')}`,
        birthDate: new Date('1990-01-01'),
        status: 'ACTIVE',
      },
    });
    const token = await jwt.signAsync({ sub: userId, phone: `+5511${userId}` });
    const socket = ioClient(url, { auth: { token }, transports: ['websocket'], reconnection: false });
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.on('connected', () => resolve());
      socket.on('connect_error', reject);
    });
    return socket;
  }

  const ack = (socket: Socket, event: string, body: unknown) =>
    new Promise<{ ok: boolean; error?: string }>((resolve) => socket.emit(event, body, resolve));

  type Emote = { tableId: string; userId: string; emote: string };

  it('reaches everyone at the table, from a seated player, once every few seconds', async () => {
    const a = await connect('emoA');
    const b = await connect('emoB');
    const outsider = await connect('emoC');
    expect((await ack(a, 'table:join', { tableId: 'emo-t1', maxSeats: 2 })).ok).toBe(true);
    expect((await ack(b, 'table:join', { tableId: 'emo-t1', maxSeats: 2 })).ok).toBe(true);

    const gotA: Emote[] = [];
    const gotB: Emote[] = [];
    const gotOutsider: Emote[] = [];
    a.on('table:emote', (e: Emote) => gotA.push(e));
    b.on('table:emote', (e: Emote) => gotB.push(e));
    outsider.on('table:emote', (e: Emote) => gotOutsider.push(e));

    expect(await ack(a, 'table:emote', { tableId: 'emo-t1', emote: 'laugh' })).toEqual({ ok: true });
    await new Promise((r) => setTimeout(r, 150));
    expect(gotB).toEqual([{ tableId: 'emo-t1', userId: 'emoA', emote: 'laugh' }]);
    expect(gotA).toHaveLength(1); // the sender sees it too, over their own seat

    // Too soon after the last one.
    expect(await ack(a, 'table:emote', { tableId: 'emo-t1', emote: 'clap' })).toEqual({
      ok: false,
      error: 'Aguarde um instante.',
    });
    // Not one of the set — nothing typed by a player is ever relayed.
    expect((await ack(b, 'table:emote', { tableId: 'emo-t1', emote: 'palavrão' })).error).toBe('Emoji inválido.');
    // Not seated at that table.
    expect((await ack(outsider, 'table:emote', { tableId: 'emo-t1', emote: 'wave' })).error).toBe(
      'Você não está nesta mesa.',
    );
    await new Promise((r) => setTimeout(r, 150));
    expect(gotB).toHaveLength(1);
    expect(gotOutsider).toHaveLength(0);

    // The other player can still react.
    expect((await ack(b, 'table:emote', { tableId: 'emo-t1', emote: 'capa' })).ok).toBe(true);
    await new Promise((r) => setTimeout(r, 150));
    expect(gotA.map((e) => e.emote)).toEqual(['laugh', 'capa']);
  });
});
