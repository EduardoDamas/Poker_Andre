import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AddressInfo } from 'net';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { io as ioClient, Socket } from 'socket.io-client';
import { AppModule } from '../app.module';
import { WalletService } from '../wallet/wallet.service';
import { DevOtpProvider } from '../auth/otp/otp-provider';
import { resetDb } from '../test-utils/reset-db';

/**
 * Multi-table tournament over real sockets: N players register, play across
 * several sub-tables driven entirely by their own socket actions, winners
 * advance round to round, and one champion is crowned + the prize settled.
 * A small field (9 → two tables → final) with a low start size so it runs fast.
 */
function genCpf(seq: number): string {
  const base = String(100_000_000 + seq).slice(0, 9).split('').map(Number);
  const digit = (digits: number[]): number => {
    const w = digits.length + 1;
    const sum = digits.reduce((a, d, i) => a + d * (w - i), 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = digit(base);
  const d2 = digit([...base, d1]);
  return base.join('') + d1 + d2;
}

describe('Multi-table tournament (socket e2e)', () => {
  let app: INestApplication;
  let wallet: WalletService;
  let otp: DevOtpProvider;
  let prisma: PrismaClient;
  let url: string;
  const sockets: Socket[] = [];
  let seq = 0;

  beforeAll(async () => {
    process.env.TOURNAMENT_START_SIZE = '9'; // start once 9 players register (→ 2 tables)
    process.env.TOURNAMENT_HAND_DELAY_MS = '0'; // no inter-hand delay in tests
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0);
    wallet = app.get(WalletService);
    otp = app.get(DevOtpProvider);
    prisma = new PrismaClient();
    url = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
    await resetDb(prisma);
  });

  afterAll(async () => {
    sockets.forEach((s) => s.close());
    await prisma.$disconnect();
    await app.close();
  });

  const server = () => app.getHttpServer();

  async function onboard(): Promise<{ userId: string; token: string }> {
    seq += 1;
    const phone = `+551188${String(seq).padStart(6, '0')}`;
    const reg = await request(server())
      .post('/auth/register')
      .send({ phone, displayName: `T${seq}`, cpf: genCpf(seq), birthDate: '1990-01-01' })
      .expect(201);
    await request(server()).post('/auth/otp/request').send({ phone }).expect(200);
    const code = otp.lastCodeFor(phone)!;
    const ver = await request(server()).post('/auth/otp/verify').send({ phone, code }).expect(200);
    return { userId: reg.body.id, token: ver.body.accessToken };
  }

  // A socket that plays every turn by shoving (or calling an all-in) — so each
  // table resolves fast. Resolves its promise if it receives the champion event.
  function connectPlayer(
    userId: string,
    token: string,
    onChampion: (prizeCents: number) => void,
  ): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const socket = ioClient(url, { auth: { token }, transports: ['websocket'], reconnection: false });
      sockets.push(socket);
      socket.on('connect_error', reject);
      socket.on('connected', () => resolve(socket));
      socket.on('tournament:champion', (d: { prizeCents: number }) => onChampion(d.prizeCents));
      socket.on('game:state', (s: {
        tableId: string;
        actingPlayerId: string | null;
        legalActions: string[];
        actingStack: number;
        actingCommitted: number;
      }) => {
        if (s.actingPlayerId !== userId) return;
        const legal = s.legalActions ?? [];
        const action = legal.includes('raise')
          ? { type: 'raise', amount: s.actingCommitted + s.actingStack } // shove
          : legal.includes('bet')
            ? { type: 'bet', amount: s.actingStack }
            : legal.includes('call')
              ? { type: 'call' }
              : legal.includes('check')
                ? { type: 'check' }
                : { type: 'fold' };
        socket.emit('hand:action', { tableId: s.tableId, action });
      });
    });
  }

  it('runs a 9-player tournament to a champion over sockets and reconciles', async () => {
    const N = 9;
    const ENTRY = 2000n; // level 1 V.I. = R$20

    let resolveChampion!: (prizeCents: number) => void;
    const championSeen = new Promise<number>((resolve) => (resolveChampion = resolve));

    const players: { userId: string; token: string }[] = [];
    for (let i = 0; i < N; i++) {
      const p = await onboard();
      await wallet.deposit(p.userId, ENTRY);
      players.push(p);
      await connectPlayer(p.userId, p.token, (c) => resolveChampion(c)); // sockets[i] ↔ players[i]
    }

    // Register everyone; the 9th registration reaches the start size and kicks off.
    await Promise.all(
      players.map(
        (_p, i) =>
          new Promise<void>((res) =>
            sockets[i].emit('tournament:register', { tournamentId: 'cup-1', level: 1 }, () => res()),
          ),
      ),
    );

    const prize = await Promise.race([
      championSeen,
      new Promise<number>((_r, rej) => setTimeout(() => rej(new Error('no champion within 30s')), 30_000)),
    ]);
    expect(prize).toBeGreaterThanOrEqual(0); // a champion was crowned over sockets

    // Money conserved system-wide (every ledger entry sums to zero).
    const all = await prisma.ledgerEntry.aggregate({ _sum: { amountCents: true } });
    expect(all._sum.amountCents).toBe(0n);

    // Every entry was collected — player wallets never exceed what was deposited.
    let totalPlayers = 0n;
    for (const p of players) totalPlayers += await wallet.getBalance(p.userId);
    expect(totalPlayers).toBeLessThanOrEqual(BigInt(N) * ENTRY);
  }, 45_000);
});
