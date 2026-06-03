/**
 * Dev bot opponent — lets you verify a full hand with one (or zero) real phones.
 *
 *   npm run bot -- poker-l1 1        # bot #1 sits at poker-l1 and auto-plays
 *   npm run bot -- poker-l1 2        # a second bot → a hand starts immediately
 *
 * For a one-phone demo: start ONE bot, then open the app on your phone and tap
 * the same room — the hand begins when you sit (2 players). The bot checks/calls
 * to showdown and prints the result. It creates + funds its own user via DI.
 */
import { NestFactory } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { io } from 'socket.io-client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { WalletService } from '../src/wallet/wallet.service';

// Valid-CPF generator (check digits) so registration passes.
function genCpf(seq: number): string {
  const base = String(900_000_000 + seq).slice(0, 9).split('').map(Number);
  const digit = (d: number[]) => {
    const w = d.length + 1;
    const r = d.reduce((a, x, i) => a + x * (w - i), 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = digit(base);
  return base.join('') + d1 + digit([...base, d1]);
}

async function main() {
  const tableId = process.argv[2] ?? 'poker-l1';
  const index = Number(process.argv[3] ?? '1');
  const url = process.env.API_BASE ?? 'http://localhost:3000';

  const ctx = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const prisma = ctx.get(PrismaService);
  const wallet = ctx.get(WalletService);
  const jwt = ctx.get(JwtService);

  const phone = `+551190000${String(index).padStart(4, '0')}`;
  let user = await prisma.user.findUnique({ where: { phone } });
  user ??= await prisma.user.create({
    data: {
      phone,
      displayName: `Bot ${index}`,
      cpf: genCpf(index),
      birthDate: new Date('1990-01-01'),
      status: 'ACTIVE',
    },
  });
  await wallet.deposit(user.id, 100000n); // R$1000 so it can buy in
  const token = await jwt.signAsync({ sub: user.id, phone });
  const userId = user.id;

  console.log(`Bot ${index} (${userId}) connecting to ${url} → table ${tableId}…`);
  const socket = io(url, { auth: { token }, transports: ['websocket'], reconnection: false });

  socket.on('connected', () => {
    console.log(`Bot ${index} authenticated; joining ${tableId}`);
    socket.emit('table:join', { tableId, maxSeats: 8 });
  });
  socket.on('game:state', (s: any) => {
    if (s.actingPlayerId === userId) {
      const type = (s.legalActions ?? []).includes('check') ? 'check' : 'call';
      socket.emit('hand:action', { tableId, action: { type } });
    }
  });
  socket.on('hand:result', async (r: any) => {
    console.log(`Bot ${index} — hand result. Board: ${r.board?.join(' ')}`);
    console.log(`  payouts:`, r.payouts);
    const bal = await wallet.getBalance(userId);
    console.log(`  Bot ${index} wallet now: ${bal} cents`);
    setTimeout(async () => {
      socket.close();
      await ctx.close();
      process.exit(0);
    }, 500);
  });
  socket.on('unauthorized', (m: any) => console.error('unauthorized', m));
  socket.on('connect_error', (e: any) => console.error('connect_error', e?.message ?? e));

  console.log(`Bot ${index} waiting for an opponent… (Ctrl-C to quit)`);
}

main();
