/**
 * Dev helper: create a pending withdrawal request for a player (so the admin
 * panel has something to approve/reject).
 *   npm run withdraw -- +5511999998888 20000 chave@pix.com
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { WithdrawalService } from '../src/wallet/withdrawal.service';

async function main() {
  const phone = process.argv[2];
  const cents = BigInt(process.argv[3] ?? '20000');
  const pixKey = process.argv[4] ?? 'chave@pix.com';
  if (!phone) {
    console.error('usage: npm run withdraw -- <phone> [cents] [pixKey]');
    process.exit(1);
  }
  const ctx = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const prisma = ctx.get(PrismaService);
  const withdrawals = ctx.get(WithdrawalService);
  const user = await prisma.user.findUniqueOrThrow({ where: { phone } });
  const wd = await withdrawals.request(user.id, cents, pixKey);
  console.log(`Created REQUESTED withdrawal ${wd.id} for ${phone}: ${cents} cents to ${pixKey}`);
  await ctx.close();
}
main();
