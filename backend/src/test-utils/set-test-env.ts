// Runs before each test file (jest `setupFiles`). Points Prisma at the test DB
// *before* any PrismaClient is instantiated by a test.
import { TEST_DATABASE_URL } from './test-db';

process.env.DATABASE_URL = TEST_DATABASE_URL;
