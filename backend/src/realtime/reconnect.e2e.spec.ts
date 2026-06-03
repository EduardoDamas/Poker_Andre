import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { AddressInfo } from 'net';
import { PrismaClient } from '@prisma/client';
import { io as ioClient, Socket } from 'socket.io-client';
import { AppModule } from '../app.module';
import { WalletService } from '../wallet/wallet.service';
import { resetDb } from '../test-utils/reset-db';

/**
 * STEP D4 gate — disconnect mid-hand, reconnect, restore state, hand continues.
 */
describe('Reconnection (e2e)', () => {
  let app: INestApplication;
  let jwt: JwtService;
  let wallet: WalletService;
  let prisma: PrismaClient;
  let url: string;
  const sockets: Socket[] = [];
  let counter = 0;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0);
    jwt = app.get(JwtService);
    wallet = app.get(WalletService);
    prisma = new PrismaClient();
    url = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    sockets.forEach((s) => s.close());
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    await resetDb(prisma);
  });

  async function createUser(): Promise<{ userId: string; token: string }> {
    counter += 1;
    const user = await prisma.user.create({
      data: {
        phone: `+5511966600${counter.toString().padStart(3, '0')}`,
        displayName: `RC${counter}`,
        cpf: `6600000000${counter.toString().padStart(2, '0')}`,
        birthDate: new Date('1990-01-01'),
      },
    });
    await wallet.deposit(user.id, 100n);
    const token = await jwt.signAsync({ sub: user.id, phone: user.phone });
    return { userId: user.id, token };
  }

  // Connect a socket. With `bot`, auto-plays (check/call) on its turn.
  async function connect(userId: string, token: string, tableId: string, bot: boolean): Promise<Socket> {
    const socket = ioClient(url, { auth: { token }, transports: ['websocket'], reconnection: false });
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.on('connected', () => resolve());
      socket.on('connect_error', reject);
    });
    if (bot) {
      socket.on('game:state', (s: { actingPlayerId: string; legalActions: string[] }) => {
        if (s.actingPlayerId === userId) {
          socket.emit('hand:action', {
            tableId,
            action: { type: s.legalActions.includes('check') ? 'check' : 'call' },
          });
        }
      });
    }
    return socket;
  }

  const once = <T>(socket: Socket, event: string): Promise<T> =>
    new Promise((resolve) => socket.once(event, resolve));

  it('restores hole cards & game state on reconnect, and the hand still finishes', async () => {
    const tableId = 'rc1';
    const A = await createUser();
    const B = await createUser();

    // A is a *manual* socket (no auto-play) so the hand freezes on A's turn.
    const aSock = await connect(A.userId, A.token, tableId, false);
    const bSock = await connect(B.userId, B.token, tableId, true);

    const aHoleP = once<{ cards: string[] }>(aSock, 'hand:hole');
    const aStateP = once<{ actingPlayerId: string; board: string[]; street: string }>(aSock, 'game:state');

    aSock.emit('table:join', { tableId, maxSeats: 2 }); // A → seat 0 (SB, acts first)
    bSock.emit('table:join', { tableId, maxSeats: 2 }); // B → seat 1, hand starts

    const origHole = await aHoleP;
    const origState = await aStateP;
    // Sanity: it is A's turn preflop, so nothing will progress while A is gone.
    expect(origState.actingPlayerId).toBe(A.userId);
    expect(origState.street).toBe('preflop');

    // --- A drops mid-hand ---
    aSock.close();

    // --- A reconnects on a brand-new socket (same identity), now auto-playing ---
    const aSock2 = await connect(A.userId, A.token, tableId, true);
    const reHoleP = once<{ cards: string[] }>(aSock2, 'hand:hole');
    const reStateP = once<{ actingPlayerId: string; board: string[]; street: string }>(aSock2, 'game:state');
    const resultP = once<any>(bSock, 'hand:result');

    const rejoinAck = await new Promise<{ ok: boolean; position?: number }>((resolve) =>
      aSock2.emit('table:rejoin', { tableId }, resolve),
    );
    expect(rejoinAck).toMatchObject({ ok: true, position: 0 });

    const reHole = await reHoleP;
    const reState = await reStateP;
    // Restored view matches what A had before the drop.
    expect(reHole.cards).toEqual(origHole.cards);
    expect(reState.actingPlayerId).toBe(A.userId);
    expect(reState.board).toEqual(origState.board);
    expect(reState.street).toBe('preflop');

    // The hand resumes (A's reconnected bot acts) and plays to showdown.
    const result = await resultP;
    expect(result.board).toHaveLength(5);

    // Settlement still correct & conserved.
    const balA = await wallet.getBalance(A.userId);
    const balB = await wallet.getBalance(B.userId);
    expect(balA).toBe(BigInt(result.finalStacks[A.userId]));
    expect(balB).toBe(BigInt(result.finalStacks[B.userId]));
    expect(balA + balB).toBe(200n);
  });

  it('rejecting reconnect to a table where the user never sat', async () => {
    const A = await createUser();
    const aSock = await connect(A.userId, A.token, 'ghost', false);
    const ack = await new Promise<{ ok: boolean; error?: string }>((resolve) =>
      aSock.emit('table:rejoin', { tableId: 'ghost' }, resolve),
    );
    expect(ack.ok).toBe(false);
  });
});
