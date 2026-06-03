import { PrismaClient } from '@prisma/client';

// Truncate every table in one FK-safe statement. CASCADE handles dependency
// order, RESTART IDENTITY resets sequences. Used in each spec's beforeEach so
// tests are isolated regardless of run order (the suite shares one test DB).
export async function resetDb(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE ' +
      [
        '"LedgerEntry"',
        '"LedgerTransaction"',
        '"Withdrawal"',
        '"Seat"',
        '"Hand"',
        '"Account"',
        '"Table"',
        '"OtpCode"',
        '"AuditLog"',
        '"User"',
      ].join(', ') +
      ' RESTART IDENTITY CASCADE',
  );
}
