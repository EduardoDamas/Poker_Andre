// Jest globalSetup: runs ONCE before the whole suite.
// 1. Creates the test database if it doesn't exist.
// 2. Applies the Prisma schema (migrate deploy) to it.
import { execSync } from 'child_process';
import { ADMIN_DATABASE_URL, TEST_DATABASE_URL } from './test-db';

export default async function globalSetup() {
  // Create the test database (ignore "already exists").
  try {
    execSync(`psql "${ADMIN_DATABASE_URL}" -c "CREATE DATABASE capa_contest_test"`, {
      stdio: 'ignore',
    });
  } catch {
    // already exists — fine
  }

  // Apply the schema to the test database.
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  });
}
