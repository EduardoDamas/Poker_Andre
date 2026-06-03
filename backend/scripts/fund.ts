/**
 * Dev helper: fund a player's wallet (there is no public deposit endpoint in
 * Phase 1 — deposits are manual). Reuses the tested WalletService via DI.
 *
 *   npm run fund -- +5511999998888 100000      # fund R$1000,00 (cents)
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { WalletService } from '../src/wallet/wallet.service';
import { PrismaService } from '../src/prisma/prisma.service';

async function main() {
  const phone = process.argv[2];
  const cents = BigInt(process.argv[3] ?? '100000');
  if (!phone) {
    console.error('usage: npm run fund -- <phone> [cents]');
    process.exit(1);
  }

  const ctx = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const prisma = ctx.get(PrismaService);
  const wallet = ctx.get(WalletService);

  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user) {
    console.error(`No user with phone ${phone}. Register in the app first, then fund.`);
    await ctx.close();
    process.exit(1);
  }

  await wallet.deposit(user.id, cents);
  const balance = await wallet.getBalance(user.id);
  console.log(`Funded ${phone}. Wallet balance: ${balance} cents (R$ ${(Number(balance) / 100).toFixed(2)}).`);
  await ctx.close();
}

main();
