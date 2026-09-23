/**
 * Load and timing test for a promotion (client, 2026-09-22: up to 100 players,
 * tables play down to one, winners meet at a final table).
 *
 *   npm run build
 *   npm run load:promo -- 100 400      # 100 players, ~400 ms "thinking" per action
 *
 * Starts the built backend (dist/main.js) as its own process — like production —
 * seats [players] simulated players in a fresh promotion and plays it to the
 * champion, sampling the server's memory and CPU. Players act like the
 * installed app (actions under the promo room id) with a rough human strategy:
 * the robots' check/call/fold plus shoves with strong hands.
 *
 * It then estimates how long the real promotion takes: every table's decisions
 * × a human's time per decision, plus the deal pauses; a round lasts as long as
 * its slowest table. LOCAL ONLY — it creates users in the database .env points at.
 */
import { spawn, exec, ChildProcess } from 'child_process';
import { promisify } from 'util';
import { createWriteStream } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { io, Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PromoService, promoRoomId } from '../src/promo/promo.service';
import { decideRobotAction } from '../src/realtime/bot-brain';
import { Card } from '../src/poker/deck';

const PLAYERS = Math.min(Number(process.argv[2] ?? '100'), 100);
const THINK_MS = Number(process.argv[3] ?? '400');
const PORT = Number(process.env.LOAD_PORT ?? '3100');
const URL = `http://127.0.0.1:${PORT}`;
// Production pacing, so hand counts and pauses are the real ones.
const SERVER_ENV = {
  PORT: String(PORT),
  TOURNAMENT_HAND_DELAY_MS: '1500',
  BRACKET_ROUND_DELAY_MS: '5000',
  TURN_TIMEOUT_MS: '30000',
};

function genCpf(seq: number): string {
  const base = String(700_000_000 + seq).slice(0, 9).split('').map(Number);
  const d = (a: number[]) => {
    const w = a.length + 1;
    const r = a.reduce((s, x, i) => s + x * (w - i), 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = d(base);
  return base.join('') + d1 + d([...base, d1]);
}

const run = promisify(exec);

/**
 * Resident memory (MB) and total CPU seconds of a process. Asynchronous: the
 * simulated players share this process, and a blocking call here (PowerShell
 * takes seconds to start) would freeze them and fake a slow server.
 */
async function sample(pid: number): Promise<{ rssMb: number; cpuSec: number } | null> {
  try {
    if (process.platform === 'win32') {
      const { stdout } = await run(
        `powershell -NoProfile -Command "$p = Get-Process -Id ${pid}; '{0} {1}' -f $p.WorkingSet64, $p.CPU"`,
      );
      const [ws, cpu] = stdout.trim().split(' ');
      return { rssMb: Number(ws) / 1048576, cpuSec: Number(cpu.replace(',', '.')) };
    }
    const { stdout } = await run(`ps -o rss=,cputime= -p ${pid}`);
    const [rss, time] = stdout.trim().split(/\s+/);
    const [h, m, s] = time.split(':').map(Number);
    return { rssMb: Number(rss) / 1024, cpuSec: h * 3600 + m * 60 + s };
  } catch {
    return null;
  }
}

async function waitForServer(): Promise<void> {
  for (let i = 0; i < 120; i++) {
    try {
      const res = await fetch(`${URL}/health`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('Server did not start.');
}

interface TableStats {
  hands: number;
  decisions: number;
  openedAt: number;
  closedAt?: number;
  round: number;
  final: boolean;
  players: number;
}

async function main() {
  const logPath = join(tmpdir(), 'capa-load-server.log');
  const server: ChildProcess = spawn(process.execPath, [join(__dirname, '..', 'dist', 'main.js')], {
    env: { ...process.env, ...SERVER_ENV },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const log = createWriteStream(logPath);
  server.stdout!.pipe(log);
  server.stderr!.pipe(log);
  console.log(`Server log: ${logPath}`);
  const stop = () => server.kill();
  process.on('exit', stop);

  const ctx = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const prisma = ctx.get(PrismaService);
  const jwt = ctx.get(JwtService);
  const promo = ctx.get(PromoService);

  console.log(`Preparing ${PLAYERS} players…`);
  const players: { id: string; token: string }[] = [];
  for (let i = 1; i <= PLAYERS; i++) {
    const phone = `+551188800${String(i).padStart(4, '0')}`;
    const user =
      (await prisma.user.findUnique({ where: { phone } })) ??
      (await prisma.user.create({
        data: { phone, displayName: `Carga ${i}`, cpf: genCpf(i), birthDate: new Date('1990-01-01'), status: 'ACTIVE' },
      }));
    players.push({ id: user.id, token: await jwt.signAsync({ sub: user.id, phone }) });
  }
  await waitForServer();
  const baseline = await sample(server.pid!);

  const event = await promo.createEvent({
    name: 'Carga',
    startsAt: new Date(Date.now() + 15_000), // everyone joins, then it starts on the clock
    prizeCents: 25000n,
    prizeSubscriberCents: 50000n,
    minPlayers: PLAYERS,
    maxPlayers: PLAYERS,
    waitMinutes: null,
  });
  const roomId = promoRoomId(event.id);

  const tables = new Map<string, TableStats>();
  const observer = new Map<string, string>(); // tableId → the player counting its events
  let startedAt = 0;
  let champion: { winnerId: string; prizeCents: number } | null = null;
  const sockets: Socket[] = [];
  const joins = { ok: 0, failed: [] as string[] };
  const eliminated = new Set<string>();
  const rejected: string[] = [];

  const championDone = new Promise<void>((resolve) => {
    players.forEach((p, i) => {
      const s = io(URL, { auth: { token: p.token }, transports: ['websocket'], reconnection: false });
      sockets.push(s);
      let hole: Card[] = [];
      let tableId = '';
      s.on('connected', () =>
        s.emit('table:join', { tableId: roomId, maxSeats: 100, level: 0 }, (ack: { ok: boolean; error?: string }) => {
          if (ack?.ok) joins.ok += 1;
          else joins.failed.push(ack?.error ?? '?');
        }),
      );
      s.on('tournament:eliminated', () => eliminated.add(p.id));
      s.on('tournament:table', (d: { tableId: string; round: number; final: boolean }) => {
        tableId = d.tableId;
        if (!startedAt) startedAt = Date.now();
        if (!tables.has(d.tableId)) {
          tables.set(d.tableId, { hands: 0, decisions: 0, openedAt: Date.now(), round: d.round, final: d.final, players: 0 });
          observer.set(d.tableId, p.id);
        }
        tables.get(d.tableId)!.players += 1;
      });
      s.on('hand:hole', (d: { cards: Card[] }) => (hole = d.cards));
      s.on('hand:result', (r: { tournament?: { over?: boolean; tableWinnerId?: string } }) => {
        if (observer.get(tableId) !== p.id) return;
        const t = tables.get(tableId)!;
        t.hands += 1;
        if (r.tournament?.over || r.tournament?.tableWinnerId) t.closedAt = Date.now();
      });
      s.on('game:state', (g: { actingPlayerId: string; legalActions: string[]; board: Card[]; actingStack: number; actingCommitted: number }) => {
        if (observer.get(tableId) === p.id) tables.get(tableId)!.decisions += 1;
        if (g.actingPlayerId !== p.id) return;
        const think = THINK_MS * (0.5 + Math.random());
        setTimeout(() => {
          const strong = hole.length === 2 && (hole[0][0] === hole[1][0] || 'AK'.includes(hole[0][0]) && 'AK'.includes(hole[1][0]));
          let action: { type: string; amount?: number } = decideRobotAction(hole, g.board, g.legalActions);
          if (strong && Math.random() < 0.5) {
            if (g.legalActions.includes('bet')) action = { type: 'bet', amount: g.actingStack };
            else if (g.legalActions.includes('raise')) action = { type: 'raise', amount: g.actingStack + g.actingCommitted };
          }
          s.emit('hand:action', { tableId: roomId, action }, (ack: { ok: boolean; error?: string }) => {
            if (!ack?.ok) rejected.push(`${action.type}: ${ack?.error}`);
          });
        }, think);
      });
      s.on('tournament:champion', (d: { winnerId: string; prizeCents: number }) => {
        if (i === 0) {
          champion = d;
          resolve();
        }
      });
    });
  });

  // Sample the server while it runs.
  let peak = baseline?.rssMb ?? 0;
  const cpuStart = await sample(server.pid!);
  const wallStart = Date.now();
  let sampling = false;
  const timer = setInterval(() => {
    if (sampling) return;
    sampling = true;
    void sample(server.pid!)
      .then((s) => {
        if (s) peak = Math.max(peak, s.rssMb);
      })
      .finally(() => (sampling = false));
  }, 3000);
  const progress = setInterval(() => {
    const open = [...tables.entries()].filter(([, t]) => !t.closedAt);
    console.log(
      `[${((Date.now() - wallStart) / 1000).toFixed(0)}s] joined ${joins.ok} (failed ${joins.failed.length}) · ` +
        `tables ${tables.size} (open ${open.length}) · out ${eliminated.size} · rejected actions ${rejected.length} · ` +
        open.map(([id, t]) => `${id.slice(-6)}:${t.hands}h`).join(' '),
    );
    if (joins.failed.length) console.log(`  join errors: ${[...new Set(joins.failed)].join(' | ')}`);
    if (rejected.length) console.log(`  last rejections: ${rejected.slice(-3).join(' | ')}`);
  }, 15_000);

  const limitMin = Number(process.env.LOAD_TIMEOUT_MIN ?? '40');
  const timeout = new Promise<void>((_, reject) =>
    setTimeout(() => reject(new Error(`Timed out after ${limitMin} min.`)), limitMin * 60_000),
  );
  await Promise.race([championDone, timeout]);
  clearInterval(timer);
  clearInterval(progress);
  const cpuEnd = await sample(server.pid!);
  const endedAt = Date.now();

  const all = [...tables.values()];
  const round1 = all.filter((t) => !t.final);
  const final = all.find((t) => t.final);
  const cpuPct =
    cpuStart && cpuEnd ? ((cpuEnd.cpuSec - cpuStart.cpuSec) / ((endedAt - wallStart) / 1000)) * 100 : NaN;

  console.log('\n=== Promotion load test ===');
  console.log(`Players: ${PLAYERS} · tables in round 1: ${round1.length} · final table: ${final?.players ?? '—'} players`);
  console.log(`Champion paid: ${champion ? (champion as { prizeCents: number }).prizeCents / 100 : '—'} reais`);
  console.log(`Server memory: ${baseline?.rssMb.toFixed(0)} MB idle → peak ${peak.toFixed(0)} MB (Render Starter: 512 MB)`);
  console.log(`Server CPU while playing: ${cpuPct.toFixed(0)}% of one core`);
  console.log(`Simulated run: ${((endedAt - startedAt) / 60000).toFixed(1)} min with ~${THINK_MS} ms per decision`);
  const hands = round1.map((t) => t.hands);
  const decisions = round1.map((t) => t.decisions);
  console.log(`Round 1 hands per table: min ${Math.min(...hands)} · max ${Math.max(...hands)} · avg ${(hands.reduce((a, b) => a + b, 0) / hands.length).toFixed(1)}`);
  console.log(`Round 1 decisions per table: max ${Math.max(...decisions)}`);
  if (final) console.log(`Final table: ${final.hands} hands, ${final.decisions} decisions`);

  // Real players: every decision takes human time; the pauses between hands stay.
  const HAND_PAUSE_S = 1.5 + 1; // deal delay + result banner/dealing on the phone
  const estimate = (perDecisionS: number) => {
    const tableMin = (t: TableStats) => (t.decisions * perDecisionS + t.hands * HAND_PAUSE_S) / 60;
    const r1 = round1.length ? Math.max(...round1.map(tableMin)) : 0;
    const fin = final ? tableMin(final) : 0;
    return { r1, fin, total: r1 + fin + (round1.length ? 5 / 60 : 0) };
  };
  console.log('\nEstimated real duration (a round lasts as long as its slowest table):');
  for (const s of [5, 8, 12]) {
    const e = estimate(s);
    console.log(`  ${s}s per decision → round 1 ≈ ${e.r1.toFixed(0)} min, final ≈ ${e.fin.toFixed(0)} min, total ≈ ${e.total.toFixed(0)} min`);
  }

  sockets.forEach((s) => s.close());
  await promo.cancel(event.id).catch(() => undefined); // paid events stay paid; nothing else to clean
  await ctx.close();
  stop();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
