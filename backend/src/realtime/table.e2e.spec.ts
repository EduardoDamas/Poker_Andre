import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { AddressInfo } from 'net';
import { PrismaClient } from '@prisma/client';
import { io as ioClient, Socket } from 'socket.io-client';
import { AppModule } from '../app.module';

/**
 * STEP D2 gate — table join/leave, seating, and hole-card PRIVACY.
 */
describe('GameGateway tables (e2e)', () => {
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
    // Create a real (active) user with this exact id so the gateway's block
    // check finds an active account. upsert keeps unique phone/cpf per id.
    n += 1;
    await prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: {
        id: userId,
        phone: `+551590000${n.toString().padStart(4, '0')}`,
        displayName: userId,
        cpf: `90000000${n.toString().padStart(3, '0')}`,
        birthDate: new Date('1990-01-01'),
        status: 'ACTIVE',
      },
    });
    const token = await jwt.signAsync({ sub: userId, phone: `+5511${userId}` });
    const socket = ioClient(url, { auth: { token }, transports: ['websocket'], reconnection: false });
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.on('connected', () => resolve());
      socket.on('unauthorized', () => reject(new Error('unauthorized')));
      socket.on('connect_error', reject);
    });
    return socket;
  }

  function ack(socket: Socket, event: string, body: unknown): Promise<{ ok: boolean; position?: number; error?: string }> {
    return new Promise((resolve) => socket.emit(event, body, resolve));
  }

  function once<T = unknown>(socket: Socket, event: string): Promise<T> {
    return new Promise((resolve) => socket.once(event, resolve));
  }

  it('seats two players, deals private hole cards, and never leaks them publicly', async () => {
    const a = await connect('userA');
    const b = await connect('userB');

    // Capture each player's private hole cards and the public state.
    const aHole = once<{ cards: string[] }>(a, 'hand:hole');
    const bHole = once<{ cards: string[] }>(b, 'hand:hole');
    const publicStates: any[] = [];
    a.on('table:state', (s) => publicStates.push(s));

    const ackA = await ack(a, 'table:join', { tableId: 't1', maxSeats: 2 });
    expect(ackA).toMatchObject({ ok: true, position: 0 });
    const ackB = await ack(b, 'table:join', { tableId: 't1', maxSeats: 2 });
    expect(ackB).toMatchObject({ ok: true, position: 1 });

    const [ca, cb] = await Promise.all([aHole, bHole]);
    // Each got exactly 2 cards, all four distinct (no card sent to two people).
    expect(ca.cards).toHaveLength(2);
    expect(cb.cards).toHaveLength(2);
    expect(new Set([...ca.cards, ...cb.cards]).size).toBe(4);

    // The public state shows both seated with cards, but never the cards themselves.
    const latest = publicStates[publicStates.length - 1];
    expect(latest.handInProgress).toBe(true);
    expect(latest.seats[0]).toMatchObject({ userId: 'userA', hasCards: true });
    expect(latest.seats[1]).toMatchObject({ userId: 'userB', hasCards: true });
    const serialized = JSON.stringify(publicStates);
    for (const card of [...ca.cards, ...cb.cards]) {
      expect(serialized).not.toContain(card); // no hole card ever broadcast
    }
  });

  it('rejects joining a full table', async () => {
    const a = await connect('fullA');
    const b = await connect('fullB');
    const c = await connect('fullC');
    await ack(a, 'table:join', { tableId: 'tfull', maxSeats: 2 });
    await ack(b, 'table:join', { tableId: 'tfull', maxSeats: 2 });
    const ackC = await ack(c, 'table:join', { tableId: 'tfull', maxSeats: 2 });
    expect(ackC.ok).toBe(false);
    expect(ackC.error).toMatch(/full/i);
  });

  it('rejects the same user taking two seats', async () => {
    const a = await connect('dupUser');
    await ack(a, 'table:join', { tableId: 'tdup', maxSeats: 4 });
    const again = await ack(a, 'table:join', { tableId: 'tdup', maxSeats: 4 });
    expect(again.ok).toBe(false);
    expect(again.error).toMatch(/already seated/i);
  });

  it('leaving frees the seat in the public state', async () => {
    const a = await connect('leaveA');
    const b = await connect('leaveB');
    await ack(a, 'table:join', { tableId: 'tleave', maxSeats: 4 });
    await ack(b, 'table:join', { tableId: 'tleave', maxSeats: 4 });

    const stateAfterLeave = once<any>(b, 'table:state');
    await ack(a, 'table:leave', { tableId: 'tleave' });
    const state = await stateAfterLeave;
    expect(state.seats[0]).toBeNull(); // userA's seat freed
    expect(state.seats[1]).toMatchObject({ userId: 'leaveB' });
  });
});
