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
 * STEP D3 gate — play a full hand over sockets, settle the winner into wallets.
 * Combines the realtime layer (D) with ledger settlement (C6).
 */
describe('Play a hand over sockets (e2e)', () => {
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

  // Create a funded user (100 cents) and a connected, authenticated, auto-playing bot.
  async function botPlayer(tableId: string): Promise<{ userId: string; socket: Socket }> {
    counter += 1;
    const user = await prisma.user.create({
      data: {
        phone: `+5511955500${counter.toString().padStart(3, '0')}`,
        displayName: `Bot${counter}`,
        cpf: `5500000000${counter.toString().padStart(2, '0')}`,
        birthDate: new Date('1990-01-01'),
      },
    });
    await wallet.deposit(user.id, 100n);

    const token = await jwt.signAsync({ sub: user.id, phone: user.phone });
    const socket = ioClient(url, { auth: { token }, transports: ['websocket'], reconnection: false });
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.on('connected', () => resolve());
      socket.on('connect_error', reject);
    });

    // Passive auto-play: check if legal, otherwise call.
    socket.on('game:state', (state: { actingPlayerId: string; legalActions: string[] }) => {
      if (state.actingPlayerId === user.id) {
        const type = state.legalActions.includes('check') ? 'check' : 'call';
        socket.emit('hand:action', { tableId, action: { type } });
      }
    });

    return { userId: user.id, socket };
  }

  function balanceOf(userId: string): Promise<bigint> {
    return wallet.getBalance(userId);
  }

  it('plays heads-up to showdown and credits the winner via the ledger', async () => {
    const tableId = 'g1';
    const a = await botPlayer(tableId);
    const b = await botPlayer(tableId);

    // The result arrives once the hand reaches showdown.
    const resultPromise = new Promise<any>((resolve) => b.socket.once('hand:result', resolve));

    a.socket.emit('table:join', { tableId, maxSeats: 2 });
    b.socket.emit('table:join', { tableId, maxSeats: 2 });

    const result = await resultPromise;

    // The hand produced a board, pots, and payouts.
    expect(result.board).toHaveLength(5);
    expect(result.pots.length).toBeGreaterThanOrEqual(1);

    // Wallets now reflect the engine's final stacks exactly.
    const balA = await balanceOf(a.userId);
    const balB = await balanceOf(b.userId);
    expect(balA).toBe(BigInt(result.finalStacks[a.userId]));
    expect(balB).toBe(BigInt(result.finalStacks[b.userId]));

    // Money is conserved (no rake): the two wallets still total the 200 deposited.
    expect(balA + balB).toBe(200n);

    // The whole ledger nets to zero.
    const agg = await prisma.ledgerEntry.aggregate({ _sum: { amountCents: true } });
    expect(agg._sum.amountCents).toBe(0n);

    // Exactly one of them came out ahead (heads-up, no chop expected here generally,
    // but assert the winner's wallet grew and the system is consistent).
    const winners = new Set<string>(result.pots.flatMap((p: any) => p.winnerIds));
    expect(winners.size).toBeGreaterThanOrEqual(1);
    for (const w of winners) {
      expect(result.payouts[w]).toBeGreaterThan(0);
    }
  });

  // NOTE: a hand currently auto-starts as soon as 2 players are seated (cash-style).
  // "Begin a hand with N>2 seated players" (e.g. Sit-&-Go fill-to-start, or a
  // between-hands lobby) is a product decision deferred to table-lifecycle hardening.
});
