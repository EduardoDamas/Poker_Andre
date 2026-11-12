#!/usr/bin/env node
/**
 * Copies the production database from Render (old hosting) to Railway.
 *
 *   node backend/scripts/move-db-to-railway.js         # check only: no DB access, no changes
 *   node backend/scripts/move-db-to-railway.js --go    # do the copy
 *
 * What --go does (it stops at the first problem; Render is only ever read):
 *   1. Render's database must be "available" (pay the invoice first if it is suspended)
 *      and Render's web service must be suspended (dashboard → capa-contest-api →
 *      Settings → Suspend), so no game or deposit lands on Render after the copy.
 *   2. pg_dump Render into BACKUP_DIR (default C:\Tools\backups) and keep the file.
 *   3. Count the rows of every table and the money totals on Render.
 *   4. Stop the Railway API so nothing writes during the restore.
 *   5. Open a temporary TCP proxy to Railway's Postgres.
 *   6. Refuse to go on if Railway already has players (pass --overwrite to allow it;
 *      Railway is then backed up first too).
 *   7. Empty Railway's schema and pg_restore the dump in a single transaction.
 *   8. Compare row counts and totals with Render; any difference stops here, API still off.
 *   9. Close the proxy, deploy the API (it applies any newer migrations), check /health.
 *
 * Rehearsal: --from-local copies the local dev database (backend/.env DATABASE_URL)
 * instead of Render, and --reset-after empties Railway again at the end. It never
 * runs over a Railway database that has players, even with --overwrite.
 *
 * Needs .render-key.txt and .railway-token.txt in the repo root, and the PostgreSQL 17
 * client tools (PG_BIN, default C:\Tools\pgsql\bin). Secrets are never printed.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const PG_BIN = process.env.PG_BIN || 'C:/Tools/pgsql/bin';
const BACKUP_DIR = process.env.BACKUP_DIR || 'C:/Tools/backups';
const RENDER_DB = 'dpg-d9rlff710e5c738bm1p0-a';
const RENDER_API = 'srv-d9rlhdf40ujc73bpamj0';
const RW = {
  project: '2c24a5ae-e172-4dad-9b8c-d238e665752c',
  env: '22eb5ace-dfa3-4d74-9a19-39dfadd789e1',
  api: '651976c9-b662-46ef-bfb3-e70f632cf144',
  pg: '69e4c916-7673-4913-aba9-a5f376343398',
  url: 'https://capa-contest-api-production-895bebf9.up.railway.app',
};

const args = new Set(process.argv.slice(2));
const GO = args.has('--go');
const FROM_LOCAL = args.has('--from-local');
const RESET_AFTER = args.has('--reset-after');
const OVERWRITE = args.has('--overwrite') && !FROM_LOCAL;
for (const a of args) if (!['--go', '--from-local', '--reset-after', '--overwrite'].includes(a)) {
  console.error(`unknown option ${a}`); process.exit(2);
}

// ---------- output that never shows a secret ----------
const secrets = [];
const redact = (s) => secrets.reduce((out, x) => (x ? out.split(x).join('***') : out), String(s ?? ''));
const t0 = Date.now();
const log = (...a) => console.log(`[${String(Math.round((Date.now() - t0) / 1000)).padStart(4)}s] ${redact(a.join(' '))}`);
class Stop extends Error {}
const stop = (msg) => { throw new Stop(msg); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readToken(file) {
  const p = path.join(ROOT, file);
  if (!fs.existsSync(p)) stop(`${file} is missing in the repo root`);
  const t = fs.readFileSync(p, 'utf8').trim();
  secrets.push(t);
  return t;
}

// ---------- Postgres via the client tools (connection details go in env, never argv) ----------
const exe = (tool) => path.join(PG_BIN, process.platform === 'win32' ? `${tool}.exe` : tool);

function pgEnv(url) {
  const u = new URL(url);
  const local = ['localhost', '127.0.0.1', '::1'].includes(u.hostname);
  const env = {
    PGHOST: u.hostname,
    PGPORT: u.port || '5432',
    PGUSER: decodeURIComponent(u.username),
    PGPASSWORD: decodeURIComponent(u.password),
    PGDATABASE: decodeURIComponent(u.pathname.replace(/^\//, '')),
    PGSSLMODE: u.searchParams.get('sslmode') || (local ? 'disable' : 'require'),
    PGCONNECT_TIMEOUT: '20',
  };
  secrets.push(env.PGPASSWORD, url);
  return env;
}

function runTool(tool, argv, env, { allowFail = false } = {}) {
  const r = spawnSync(exe(tool), argv, { env: { ...process.env, ...env }, encoding: 'utf8', maxBuffer: 1 << 28 });
  const ok = !r.error && r.status === 0;
  if (!ok && !allowFail) {
    stop(`${tool} failed (exit ${r.status}${r.signal ? ` ${r.signal}` : ''}${r.error ? ` ${r.error.message}` : ''}): ${(r.stderr || '').trim().slice(-1500)}`);
  }
  return { ok, out: r.stdout || '', err: r.stderr || '' };
}
const psql = (env, sql, opts) => runTool('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-A', '-t', '-F', '|', '-c', sql], env, opts);
const lines = (s) => s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

/** Row counts of every table plus the money totals — compared before/after the copy. */
function snapshot(env) {
  const tables = lines(psql(env, `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY 1`).out);
  const snap = {};
  if (tables.length) {
    const q = tables.map((t) => `SELECT '${t}', count(*) FROM "${t}"`).join(' UNION ALL ');
    for (const l of lines(psql(env, q).out)) { const [k, v] = l.split('|'); snap[`rows ${k}`] = v; }
  }
  const total = (label, table, sql) => { if (tables.includes(table)) snap[label] = psql(env, sql).out.trim(); };
  total('player balances (cents)', 'Account', `SELECT COALESCE(SUM("balanceCents"), 0) FROM "Account" WHERE type = 'PLAYER'`);
  total('ledger sum (cents, must be 0)', 'LedgerEntry', `SELECT COALESCE(SUM("amountCents"), 0) FROM "LedgerEntry"`);
  total('free points', 'PointsAccount', `SELECT COALESCE(SUM("freePoints"), 0) FROM "PointsAccount"`);
  total('paid points', 'PointsAccount', `SELECT COALESCE(SUM("paidPoints"), 0) FROM "PointsAccount"`);
  return snap;
}

function playerCount(env) {
  const has = psql(env, `SELECT to_regclass('public."User"') IS NOT NULL`).out.trim() === 't';
  return has ? Number(psql(env, 'SELECT count(*) FROM "User"').out.trim()) : 0;
}

// ---------- Render + Railway APIs ----------
let renderKey; let railwayToken;
async function render(pathname) {
  const res = await fetch(`https://api.render.com/v1${pathname}`, { headers: { authorization: `Bearer ${renderKey}`, accept: 'application/json' } });
  if (!res.ok) stop(`Render API ${pathname}: HTTP ${res.status} ${redact((await res.text()).slice(0, 200))}`);
  return res.json();
}
async function gql(query, variables = {}) {
  const res = await fetch('https://backboard.railway.com/graphql/v2', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${railwayToken}` },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json().catch(() => null);
  if (!body || body.errors) stop(`Railway API: ${redact(JSON.stringify(body?.errors || res.status)).slice(0, 500)}`);
  return body.data;
}
const deployments = async () => (await gql(`query($i: DeploymentListInput!) {
    deployments(first: 10, input: $i) { edges { node { id status createdAt } } } }`,
  { i: { serviceId: RW.api, environmentId: RW.env } })).deployments.edges.map((e) => e.node);

async function stopApi() {
  const busy = (await deployments()).filter((d) => ['BUILDING', 'DEPLOYING', 'INITIALIZING', 'QUEUED', 'WAITING'].includes(d.status));
  if (busy.length) stop(`a Railway deploy is in progress (${busy[0].status}); wait for it to finish and run again`);
  for (const d of (await deployments()).filter((x) => ['SUCCESS', 'SLEEPING', 'CRASHED'].includes(x.status))) {
    await gql('mutation($id: String!) { deploymentRemove(id: $id) }', { id: d.id });
    log(`API deployment ${d.id} stopping`);
  }
  for (let i = 0; i < 24; i++) {
    if (!(await deployments()).some((d) => ['SUCCESS', 'SLEEPING', 'REMOVING'].includes(d.status))) return log('API stopped');
    await sleep(5000);
  }
  stop('the Railway API did not stop within 2 minutes');
}

async function startApi() {
  await gql(`mutation($s: String!, $e: String!) { serviceInstanceDeploy(serviceId: $s, environmentId: $e, latestCommit: true) }`,
    { s: RW.api, e: RW.env });
  log('API deploy started (latest commit of main)');
  for (let i = 0; i < 120; i++) {
    await sleep(10000);
    const latest = (await deployments())[0];
    if (latest?.status === 'SUCCESS') break;
    if (['FAILED', 'CRASHED', 'REMOVED'].includes(latest?.status)) stop(`API deploy ended ${latest.status} — see Railway → capa-contest-api → Deployments → logs`);
    if (i === 119) stop('API deploy did not finish within 20 minutes');
  }
  const res = await fetch(`${RW.url}/health`);
  const body = await res.text();
  if (!res.ok || !body.includes('reachable')) stop(`API is up but /health answered ${res.status}: ${body.slice(0, 200)}`);
  log(`API live: ${RW.url}/health → ${body}`);
}

async function openProxy() {
  const q = `query($e: String!, $s: String!) { tcpProxies(environmentId: $e, serviceId: $s) { id domain proxyPort } }`;
  let proxy = (await gql(q, { e: RW.env, s: RW.pg })).tcpProxies[0];
  let created = false;
  if (!proxy) {
    proxy = (await gql(`mutation($i: TCPProxyCreateInput!) { tcpProxyCreate(input: $i) { id domain proxyPort } }`,
      { i: { environmentId: RW.env, serviceId: RW.pg, applicationPort: 5432 } })).tcpProxyCreate;
    created = true;
  }
  const v = (await gql(`query($p: String!, $e: String!, $s: String!) { variables(projectId: $p, environmentId: $e, serviceId: $s) }`,
    { p: RW.project, e: RW.env, s: RW.pg })).variables;
  const env = {
    PGHOST: proxy.domain, PGPORT: String(proxy.proxyPort), PGUSER: v.POSTGRES_USER, PGPASSWORD: v.POSTGRES_PASSWORD,
    PGDATABASE: v.POSTGRES_DB, PGSSLMODE: 'require', PGCONNECT_TIMEOUT: '20',
  };
  secrets.push(env.PGPASSWORD);
  log(`proxy to Railway Postgres ${created ? 'opened' : 'already open'}: ${proxy.domain}:${proxy.proxyPort}`);
  for (let i = 0; i < 30; i++) {
    if (psql(env, 'SELECT 1', { allowFail: true }).ok) return { proxy, created, env };
    await sleep(10000);
  }
  if (created) await gql('mutation($id: String!) { tcpProxyDelete(id: $id) }', { id: proxy.id }).catch(() => {});
  stop('could not reach Railway Postgres through the proxy within 5 minutes');
}

function sourceUrlFromLocalEnv() {
  const envFile = path.join(ROOT, 'backend', '.env');
  if (!fs.existsSync(envFile)) stop('backend/.env not found (needed for --from-local)');
  const line = fs.readFileSync(envFile, 'utf8').split(/\r?\n/).find((l) => /^\s*DATABASE_URL\s*=/.test(l));
  if (!line) stop('DATABASE_URL not in backend/.env');
  return line.replace(/^\s*DATABASE_URL\s*=\s*/, '').replace(/^["']|["']$/g, '').trim();
}

// ---------- main ----------
(async () => {
  renderKey = readToken('.render-key.txt');
  railwayToken = readToken('.railway-token.txt');

  // Checks that touch no database.
  for (const tool of ['psql', 'pg_dump', 'pg_restore']) {
    const r = runTool(tool, ['--version'], {}, { allowFail: true });
    if (!r.ok) stop(`${exe(tool)} not found or not working — set PG_BIN`);
    if (tool === 'psql') log(r.out.trim());
  }
  const db = await render(`/postgres/${RENDER_DB}`);
  log(`Render database ${db.name}: status ${db.status}, Postgres ${db.version}`);
  const web = await render(`/services/${RENDER_API}`);
  log(`Render web service ${web.name}: ${web.suspended}`);
  const svc = (await gql(`query($id: String!) { service(id: $id) { name } }`, { id: RW.api })).service;
  log(`Railway service ${svc.name}: latest deployment ${(await deployments())[0]?.status ?? 'none'}`);
  if (!FROM_LOCAL) {
    const problems = [];
    if (db.status !== 'available') problems.push(`Render database is "${db.status}" — pay the Render invoice so it resumes`);
    if (web.suspended !== 'suspended') problems.push('Render web service is running — suspend it (dashboard → capa-contest-api → Settings → Suspend) so nothing writes to Render after the copy');
    if (problems.length) {
      if (GO) stop(problems.join('; '));
      for (const p of problems) log(`→ before --go: ${p}`);
    }
  }
  if (!GO) { log('check only — nothing was changed. Run with --go to copy.'); return; }

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const src = pgEnv(FROM_LOCAL ? sourceUrlFromLocalEnv() : (await render(`/postgres/${RENDER_DB}/connection-info`)).externalConnectionString);
  const dumpFile = path.join(BACKUP_DIR, `capa-${FROM_LOCAL ? 'local' : 'render'}-${stamp}.dump`);

  log(`dumping ${FROM_LOCAL ? 'local dev' : 'Render'} database → ${dumpFile}`);
  runTool('pg_dump', ['-Fc', '--no-owner', '--no-acl', '-f', dumpFile], src);
  log(`dump done (${(fs.statSync(dumpFile).size / 1048576).toFixed(1)} MB)`);
  const before = snapshot(src);
  log(`source: ${before['rows User'] ?? 0} players, player balances ${before['player balances (cents)'] ?? 0} cents`);

  await stopApi();
  const { proxy, created, env: dst } = await openProxy();
  try {
    const players = playerCount(dst);
    if (players > 0 && !OVERWRITE) {
      stop(`Railway already has ${players} players — not overwriting them${FROM_LOCAL ? ' (never with --from-local)' : '; pass --overwrite if that is really intended'}. API left stopped: deploy it from the dashboard to restart.`);
    }
    const railwayBackup = path.join(BACKUP_DIR, `capa-railway-before-${stamp}.dump`);
    runTool('pg_dump', ['-Fc', '--no-owner', '--no-acl', '-f', railwayBackup], dst);
    log(`Railway backed up first → ${railwayBackup} (${players} players)`);

    psql(dst, 'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
    log('Railway schema emptied; restoring…');
    runTool('pg_restore', ['--no-owner', '--no-acl', '--single-transaction', '--exit-on-error', '-d', dst.PGDATABASE, dumpFile], dst);
    log('restore done; comparing');

    const after = snapshot(dst);
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
    const diff = keys.filter((k) => before[k] !== after[k]);
    for (const k of keys) log(`  ${diff.includes(k) ? '✗' : '✓'} ${k.padEnd(34)} ${before[k] ?? '-'}${diff.includes(k) ? ` ≠ ${after[k] ?? '-'}` : ''}`);
    if (diff.length) stop(`${diff.length} difference(s) after the restore — API left stopped, Render untouched. Backups: ${dumpFile}, ${railwayBackup}`);
    log('✓ Railway matches the source exactly');

    if (RESET_AFTER) {
      psql(dst, 'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
      log('--reset-after: Railway emptied again (the API recreates the tables on start)');
    }
  } finally {
    if (created) {
      await gql('mutation($id: String!) { tcpProxyDelete(id: $id) }', { id: proxy.id })
        .then(() => log('proxy closed'))
        .catch((e) => log(`could not close the proxy (${e.message}) — delete it in Railway → Postgres → Settings → Networking`));
    }
  }
  await startApi();
  log(`done. Keep ${dumpFile} until Railway has run fine for a while.`);
})().catch((e) => {
  console.error(redact(e instanceof Stop ? `STOP: ${e.message}` : `ERROR: ${e.stack || e.message}`));
  process.exit(1);
});
