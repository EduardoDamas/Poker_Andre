/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  moduleFileExtensions: ['ts', 'js', 'json'],
  // Create + migrate the test database once before the suite.
  globalSetup: '<rootDir>/test-utils/global-setup.ts',
  // Point Prisma at the test DB before any client is created.
  setupFiles: ['<rootDir>/test-utils/set-test-env.ts'],
  // DB-backed tests need a little more headroom than the default 5s.
  testTimeout: 20000,
  // Integration specs share one test database; run serially so their
  // per-test truncations don't race across parallel workers.
  maxWorkers: 1,
};
