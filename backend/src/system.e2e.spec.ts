import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { AddressInfo } from 'net';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { io as ioClient, Socket } from 'socket.io-client';
import { AppModule } from './app.module';
import { WalletService } from './wallet/wallet.service';
import { ReconciliationService } from './wallet/reconciliation.service';
import { DevOtpProvider } from './auth/otp/otp-provider';
import { resetDb } from './test-utils/reset-db';

/**
 * STEP G4 gate — full system e2e + load smoke.
 *
 * Drives the whole stack through its real public interfaces:
 *   register (HTTP) → OTP login (HTTP) → JWT → join table & play a hand (sockets)
 *   → ledger settlement → reconciliation → admin views (HTTP).
 * Funding uses WalletService directly (no public deposit endpoint in Phase 1).
 */

// Generate a check-digit-valid CPF from a sequence number.
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

describe('Full system (e2e)', () => {
  let app: INestApplication;
  let jwt: JwtService;
  let wallet: WalletService;
  let recon: ReconciliationService;
  let otpProvider: DevOtpProvider;
  let prisma: PrismaClient;
  let url: string;
  const sockets: Socket[] = [];
  let seq = 0;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0);
    jwt = app.get(JwtService);
    wallet = app.get(WalletService);
    recon = app.get(ReconciliationService);
    otpProvider = app.get(DevOtpProvider);
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

  const server = () => app.getHttpServer();

  // Full public-interface onboarding: register → OTP request → verify → JWT.
  async function onboard(): Promise<{ userId: string; token: string; phone: string }> {
    seq += 1;
    const phone = `+551190000${String(seq).padStart(4, '0')}`;
    const reg = await request(server())
      .post('/auth/register')
      .send({ phone, displayName: `U${seq}`, cpf: genCpf(seq), birthDate: '1990-01-01' })
      .expect(201);
    await request(server()).post('/auth/otp/request').send({ phone }).expect(200);
    const code = otpProvider.lastCodeFor(phone)!;
    const ver = await request(server())
      .post('/auth/otp/verify')
      .send({ phone, code })
      .expect(200);
    return { userId: reg.body.id, token: ver.body.accessToken, phone };
  }

  async function connectBot(userId: string, token: string, tableId: string): Promise<Socket> {
    const socket = ioClient(url, { auth: { token }, transports: ['websocket'], reconnection: false });
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.on('connected', () => resolve());
      socket.on('connect_error', reject);
    });
    socket.on('game:state', (s: { actingPlayerId: string; legalActions: string[] }) => {
      if (s.actingPlayerId === userId) {
        socket.emit('hand:action', {
          tableId,
          action: { type: s.legalActions.includes('check') ? 'check' : 'call' },
        });
      }
    });
    return socket;
  }

  // Onboard 2 funded players, play one hand on `tableId`, resolve the result.
  async function playOneHand(tableId: string): Promise<{ result: any; ids: string[] }> {
    const a = await onboard();
    const b = await onboard();
    await wallet.deposit(a.userId, 100n);
    await wallet.deposit(b.userId, 100n);
    const aS = await connectBot(a.userId, a.token, tableId);
    const bS = await connectBot(b.userId, b.token, tableId);
    const resultP = new Promise<any>((resolve) => bS.once('hand:result', resolve));
    aS.emit('table:join', { tableId, maxSeats: 2 });
    bS.emit('table:join', { tableId, maxSeats: 2 });
    return { result: await resultP, ids: [a.userId, b.userId] };
  }

  it('completes the whole journey and the system reconciles', async () => {
    const { result, ids } = await playOneHand('sys-1');
    const [aId, bId] = ids;

    // Wallets match the engine result; money conserved.
    const balA = await wallet.getBalance(aId);
    const balB = await wallet.getBalance(bId);
    expect(balA).toBe(BigInt(result.finalStacks[aId]));
    expect(balB).toBe(BigInt(result.finalStacks[bId]));
    expect(balA + balB).toBe(200n);

    // Reconciliation passes top-to-bottom.
    const report = await recon.run();
    expect(report.ok).toBe(true);
    expect(report.systemOk).toBe(true);

    // Admin can see the updated balances via the real API.
    const admin = await prisma.user.create({
      data: {
        phone: '+5511900099999',
        displayName: 'Admin',
        cpf: genCpf(999999),
        birthDate: new Date('1990-01-01'),
        role: 'ADMIN',
      },
    });
    const adminToken = await jwt.signAsync({ sub: admin.id, phone: admin.phone });
    const players = await request(server())
      .get('/admin/players')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const seen = players.body.find((p: any) => p.id === aId);
    expect(seen.balanceCents).toBe(balA.toString());
  });

  it('load smoke: several concurrent tables all settle and the system reconciles', async () => {
    const TABLES = 4;
    const games = await Promise.all(
      Array.from({ length: TABLES }, (_, i) => playOneHand(`load-${i}`)),
    );

    // Every table conserved its 200 chips.
    for (const { result, ids } of games) {
      const sum = (await wallet.getBalance(ids[0])) + (await wallet.getBalance(ids[1]));
      expect(sum).toBe(200n);
      expect(result.board).toHaveLength(5);
    }

    // Whole system still balances after all the concurrent play.
    const report = await recon.run();
    expect(report.ok).toBe(true);

    // Total of all player wallets equals everything deposited (TABLES × 2 × 100).
    const accounts = await prisma.account.findMany({ where: { type: 'PLAYER' } });
    let total = 0n;
    for (const acc of accounts) total += await wallet.getBalance(acc.userId!);
    expect(total).toBe(BigInt(TABLES * 2 * 100));
  });
});
