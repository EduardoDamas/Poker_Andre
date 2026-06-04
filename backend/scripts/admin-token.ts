/**
 * Dev helper: create/promote an ADMIN user and print a JWT for it.
 *   npm run admin:token            # default admin phone
 *   npm run admin:token -- +55...  # promote a specific phone to ADMIN
 */
import { NestFactory } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

function genCpf(seq: number): string {
  const base = String(800_000_000 + seq).slice(0, 9).split('').map(Number);
  const d = (a: number[]) => {
    const w = a.length + 1;
    const r = a.reduce((s, x, i) => s + x * (w - i), 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = d(base);
  return base.join('') + d1 + d([...base, d1]);
}

async function main() {
  const phone = process.argv[2] ?? '+5511900000001';
  const ctx = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const prisma = ctx.get(PrismaService);
  const jwt = ctx.get(JwtService);

  let user = await prisma.user.findUnique({ where: { phone } });
  if (user) {
    user = await prisma.user.update({ where: { id: user.id }, data: { role: 'ADMIN', status: 'ACTIVE' } });
  } else {
    user = await prisma.user.create({
      data: { phone, displayName: 'Admin', cpf: genCpf(1), birthDate: new Date('1990-01-01'), role: 'ADMIN', status: 'ACTIVE' },
    });
  }
  const token = await jwt.signAsync({ sub: user.id, phone });
  console.log('ADMIN_PHONE=' + phone);
  console.log('ADMIN_TOKEN=' + token);
  await ctx.close();
}
main();
