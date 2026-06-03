// Shared connection string for the *test* database. Kept separate from the dev
// database so tests can freely truncate tables without destroying dev data.
// Lives on the same Postgres container (port 5434), different database name.
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://capa:capa_dev_password@localhost:5434/capa_contest_test?schema=public';

// Connection to the default `postgres` db, used only to CREATE the test db.
export const ADMIN_DATABASE_URL =
  'postgresql://capa:capa_dev_password@localhost:5434/postgres';
