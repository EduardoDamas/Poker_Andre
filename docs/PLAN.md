# CAPA CONTEST — Phase 1 Build Plan (test-gated)

**Rule of the road:** every step ends with a **test gate**. We do not start the next
step until the current gate is **green**. If a gate fails, we fix *in place* and re-run
until it passes. This keeps errors from compounding.

Legend: ⬜ not started · 🟦 in progress · ✅ gate passed

Each step lists **Build** (what to write) and **Gate** (how we prove it works).
Run gates from `backend/` unless noted.

---

## STEP 0 — Environment ✅ (done)

- **Build:** monorepo, NestJS+Prisma backend, Postgres+Redis (Docker), crypto deck, ledger skeleton.
- **Gate:** `npm run build` ✅ · `npx jest` (deck) ✅ · `docker compose up -d` healthy ✅ ·
  `curl localhost:3000/health` → `{"db":"reachable"}` ✅
- **Status:** PASSED.

---

## MILESTONE A — Money core (double-entry wallet)
> Build the riskiest thing first. Pure DB logic, fully testable before any UI exists.

### STEP A1 — Ledger invariants ✅
- **Build:** finalize `LedgerService.post()` / `balanceOf()`. Add a test DB helper.
- **Gate:** integration test `ledger.service.spec.ts` proves:
  - a balanced 2-leg transaction posts and both balances move; ✅
  - an **unbalanced** transaction is **rejected** (sum ≠ 0 throws); ✅
  - at least two legs required; ✅
  - `balanceOf()` (sum of entries) equals the cached `balanceCents`; ✅
  - posting the same `referenceId` twice fails (idempotency); ✅
  - whole-system money conservation (Σ all entries == 0). ✅
- **Command:** `npx jest ledger`
- **Status:** PASSED — 6/6 (full suite 11/11, build green).

### STEP A2 — Wallet service: deposit & balance ✅
- **Build:** `WalletService.deposit()` (EXTERNAL → PLAYER), `getBalance(userId)`, `ensurePlayerAccount()` (race-safe upsert). Wired into `WalletModule` + `AppModule`.
- **Gate:** deposit R$100 → exactly 10000 cents ✅; multiple deposits accumulate to the cent ✅; zero/negative rejected ✅; no-account → 0 ✅; EXTERNAL stays a single mirror ✅; balance is always `bigint` (no floats) ✅.
- **Command:** `npx jest wallet.service`
- **Status:** PASSED — 6/6 (full suite 17/17, build green). Note: added `maxWorkers: 1` so DB specs run serially.

### STEP A3 — Withdrawal lifecycle (manual Pix) ✅
- **Build:** `WithdrawalService` — `request` (PLAYER → WITHDRAWAL_CLEARING, REQUESTED),
  `approve` (CLEARING → EXTERNAL, PAID), `reject` (CLEARING → PLAYER, REJECTED).
  Funds reserved on request; settle-once state guard.
- **Gate:** 8 tests — all three paths ✅, insufficient-funds rejected ✅, reserved funds
  can't be re-withdrawn (double-spend blocked) ✅, settle-once ✅, Pix key required ✅,
  **money conservation** (Σ all entries == 0) across a mixed sequence ✅.
- **Command:** `npx jest withdrawal`
- **Status:** PASSED — 8/8. Added shared `resetDb()` (FK-safe TRUNCATE) used by all
  specs. Full suite 25/25; build green. **Milestone A (money core) COMPLETE.**

---

## MILESTONE B — Auth & compliance
> No real money should attach to an unverified / underage / fake-CPF account.

### STEP B1 — CPF validation ✅
- **Build:** `isValidCpf()` (check-digit algorithm + repeated-digit rejection), `normalizeCpf()`, `formatCpf()`.
- **Gate:** 7 tests — valid CPFs (formatted & raw) ✅, wrong check digit ✅, repeated-digit sequences ✅, wrong length ✅, non-numeric/null ✅, normalize ✅, format mask ✅.
- **Command:** `npx jest cpf`
- **Status:** PASSED — 7/7. Full suite 32/32; build green.

### STEP B2 — Age 18+ check ✅
- **Build:** `isAdult(birthDate, now, minAge=18)` + `ageInYears()`. `now` injected → deterministic, timezone-safe (UTC).
- **Gate:** 9 tests — exactly-18-today allowed ✅, 18-tomorrow blocked ✅, clearly over/under ✅, day-before/after birthday ✅, future date ✅, invalid date ✅, custom min age ✅, ageInYears ✅.
- **Command:** `npx jest age`
- **Status:** PASSED — 9/9. Full suite 41/41; build green.

### STEP B3 — Registration ✅
- **Build:** `POST /auth/register` (AuthModule/Service/Controller + RegisterDto). Enforces B1+B2,
  unique phone/CPF, stores CPF normalised, creates User (PENDING) + PLAYER account. Global
  `APP_PIPE` ValidationPipe so prod and e2e validate identically.
- **Gate:** 7 e2e tests — valid → 201 + wallet created ✅, CPF stored digits-only & not leaked ✅,
  invalid CPF → 400 ✅, under-18 → 400 ✅, dup phone → 409 ✅, dup CPF → 409 ✅, malformed → 400 ✅.
- **Command:** `npx jest register.e2e`
- **Status:** PASSED — 7/7 (fixed supertest default-import). Full suite 48/48; build green.

### STEP B4 — Phone OTP login + JWT ✅
- **Build:** `OtpCode` model + migration; `OtpService` (6-digit code, sha256-hashed & phone-bound,
  5-min TTL, max 5 attempts, single-use); `DevOtpProvider` (logs code, exposes last code for tests);
  `POST /auth/otp/request` + `POST /auth/otp/verify` → JWT; verify activates PENDING→ACTIVE.
- **Gate:** 7 e2e tests — request → 200 + code ✅, correct code → valid JWT (sub==userId) + ACTIVE ✅,
  wrong code → 401 ✅, expired → 401 ✅, single-use/replay → 401 ✅, unregistered phone → 401 ✅, malformed → 400 ✅.
- **Command:** `npx jest otp.e2e`
- **Status:** PASSED — 7/7 (fixed JwtModule expiresIn typing). Full suite 55/55; build green.

### STEP B5 — JWT guard ✅
- **Build:** `JwtAuthGuard` (Bearer extraction + verify, attaches `req.user`), `@CurrentUser()` decorator, protected `GET /auth/me`.
- **Gate:** 4 e2e tests — no token → 401 ✅, malformed header → 401 ✅, garbage token → 401 ✅, valid token → 200 + profile ✅.
- **Command:** `npx jest jwt-guard`
- **Status:** PASSED — 4/4 (added @types/express). Full suite 59/59; build green. **Milestone B (auth & compliance) COMPLETE.**

> Facebook login is deferred to the end of Milestone B (optional for first playable build);
> same gate pattern when added.

---

## MILESTONE C — Poker engine (pure, server-authoritative)
> All pure functions. This is where most bugs hide → heaviest test coverage.

### STEP C1 — Deal hole + community cards ✅
- **Build:** `dealHand(numPlayers, deck?)` — hole cards + flop/turn/river with burns, casino order; accepts a fixed deck for deterministic tests; surfaces commit-reveal material.
- **Gate:** 12 tests — no duplicates across hole+board+burns for 2–8 players ✅, correct counts ✅, board = flop+turn+river ✅, valid card format ✅, commit-reveal exposed ✅, invalid counts rejected ✅, deterministic with fixed deck ✅.
- **Command:** `npx jest dealer`
- **Status:** PASSED — 12/12. Full suite 71/71; build green.

### STEP C2 — Hand evaluator (7 → best 5) ⬜
- **Build:** `evaluate(cards7)` → category + tie-break ranks.
- **Gate:** unit test table covering all 9 categories, ordering (royal > straight flush > quads > … > high card),
  wheel straight (A-2-3-4-5), and tie-breakers (kickers, split pots). This is the **most important gate** — be exhaustive.
- **Command:** `npx jest evaluator`

### STEP C3 — Betting round ⬜
- **Build:** blinds, turn order, legal actions (fold/check/call/bet/raise), min-raise rules, pot accrual.
- **Gate:** unit test: illegal actions rejected; betting closes when all matched; pot equals sum of contributions.
- **Command:** `npx jest betting`

### STEP C4 — Side pots (all-ins) ⬜
- **Build:** side-pot construction for multiple all-ins at different stack sizes.
- **Gate:** unit test with scripted multi-all-in scenarios; **every chip in == every chip awarded** (conservation).
- **Command:** `npx jest sidepot`

### STEP C5 — Full hand state machine ⬜
- **Build:** preflop → flop → turn → river → showdown; determine winner(s), split correctly.
- **Gate:** simulate complete scripted hands; assert correct winners & payouts; commit-reveal seed verifies.
- **Command:** `npx jest hand`

### STEP C6 — Settlement into the ledger ⬜
- **Build:** buy-in (PLAYER → table chips), payout (winnings → PLAYER), rake (→ HOUSE_RAKE), all via `LedgerService`.
- **Gate:** integration test: run a full hand; assert money **conserved** end-to-end and matches game result.
- **Command:** `npx jest settlement`

---

## MILESTONE D — Realtime multiplayer
> Now wrap the proven engine in Socket.IO. The engine is already trusted by gates above.

### STEP D1 — Authenticated socket connect ⬜
- **Build:** Socket.IO gateway; handshake requires a valid JWT.
- **Gate:** e2e socket test: connect with valid token succeeds; bad/no token disconnected.
- **Command:** `npx jest socket-auth`

### STEP D2 — Table join/leave + seating ⬜
- **Build:** join table room, take a seat, leave; broadcast public table state.
  **Hole cards sent only to their owner.**
- **Gate:** e2e: two clients join; each receives only its own hole cards; seat conflicts rejected.
- **Command:** `npx jest table`

### STEP D3 — Play a hand over sockets ⬜
- **Build:** wire C5 engine to socket events (actions in, state out); auto-start when enough players.
- **Gate:** e2e: scripted 2–3 client hand plays to showdown; winner credited (D + C6 together).
- **Command:** `npx jest play`

### STEP D4 — Reconnection ⬜
- **Build:** state in Redis; rejoin restores a player's view mid-hand.
- **Gate:** e2e: disconnect mid-hand, reconnect, state matches; hand continues correctly.
- **Command:** `npx jest reconnect`

---

## MILESTONE E — Admin panel (React-Admin, web)
### STEP E1 — Admin auth + read views ⬜
- **Build:** admin login (ADMIN role), list players / wallets / withdrawals.
- **Gate:** smoke test: admin logs in, lists pending withdrawals; non-admin blocked (403).

### STEP E2 — Mark withdrawal paid/rejected ⬜
- **Build:** admin action calls A3 approve/reject.
- **Gate:** e2e: admin marks a REQUESTED withdrawal PAID → ledger reflects it; balances conserved.

---

## MILESTONE F — Mobile app (Flutter, Android)
> Requires installing the Flutter SDK first (not yet on this machine).

### STEP F1 — Flutter project + login ⬜
- **Gate:** `flutter test` (widget) green; app builds; login screen calls OTP API against local backend.
### STEP F2 — Lobby + table list ⬜
- **Gate:** widget test; manual run shows tables from backend.
### STEP F3 — Poker table UI + gameplay ⬜
- **Gate:** manual end-to-end: two devices/emulators play a hand to showdown.

---

## MILESTONE G — Hardening & launch prep
### STEP G1 — Prize table ⬜  (room-occupancy %, 7 levels, eliminatory phases per the document)
- **Gate:** unit tests of payout math vs. the document's table for several occupancy levels.
### STEP G2 — Reconciliation job ⬜  (nightly: cached balances == Σ ledger)
- **Gate:** test detects a deliberately corrupted cache row.
### STEP G3 — Rate limiting, audit log, error tracking (Sentry) ⬜
- **Gate:** abuse test (rapid OTP / action spam) is throttled.
### STEP G4 — Full system e2e + load smoke ⬜
- **Gate:** scripted multi-table game run clean; CI green on the whole suite.

---

## Cross-cutting gates (run before every commit)
```
cd backend && npm run build && npx jest        # all green
docker compose ps                              # infra healthy
```
> Definition of done for a step = its own gate green **AND** the full suite still green
> (no regressions). Only then do we move on.
