import { Account, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Race-safe get-or-create for an account.
 *
 * Prisma's upsert is SELECT-then-INSERT, so two concurrent upserts of the same
 * singleton (e.g. the EXTERNAL or PRIZE_POOL system account) can both miss and
 * then collide on INSERT (P2002). We catch that and re-read — the row now exists.
 */
export async function ensureAccount(
  prisma: PrismaService,
  where: Prisma.AccountWhereUniqueInput,
  create: Prisma.AccountUncheckedCreateInput,
): Promise<Account> {
  try {
    return await prisma.account.upsert({ where, update: {}, create });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return prisma.account.findUniqueOrThrow({ where });
    }
    throw e;
  }
}
