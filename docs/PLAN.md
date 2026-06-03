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

### STEP C2 — Hand evaluator (7 → best 5) ✅
- **Build:** `evaluate(cards)` → `{category, name, key:[category,...tieBreakers]}`; `compareKeys`/`compareHands` for lexicographic comparison (equal = split). Handles wheel (Ace low).
- **Gate:** 34 tests — all 9 categories detected ✅, full ordering ladder (SF > quads > … > high card) ✅, A-2-3-4-5 wheel ✅, broadway > king-high ✅, SF not mistaken for straight ✅, every tie-breaker (pair/kicker/two-pair/full-house/flush/quads) ✅, split-pot ties ✅, best-5-of-7 incl. two-trips full house ✅, <5 cards rejected ✅.
- **Command:** `npx jest hand-evaluator`
- **Status:** PASSED — 34/34. Full suite 105/105; build green.

### STEP C3 — Betting round ✅
- **Build:** `BettingRound` (preflop/postflop factories) — blinds, turn order, BB option, legal-action validation, min-raise rule, all-in (partial call / short bet), reopen-on-raise, completion detection, contribution/pot snapshot.
- **Gate:** 14 tests — blinds & first-to-act ✅, BB option ✅, out-of-turn rejected ✅, illegal check/call/bet rejected ✅, min opening bet ✅, min-raise enforced ✅, legal raise reopens action ✅, closes when matched ✅, fold-to-one ✅, pot == Σ contributions ✅, short all-in call ✅, all-in bet below min ✅.
- **Command:** `npx jest betting-round`
- **Status:** PASSED — 14/14. Full suite 119/119; build green.

### STEP C4 — Side pots (all-ins) ✅
- **Build:** `buildSidePots(contributions, folded)` → `{pots, refunds}`. Layer-by-contribution-level construction, eligibility excludes folded, adjacent equal-eligibility pots merged, **uncalled-bet refund** (lone top contributor capped to 2nd-highest).
- **Gate:** 7 tests — single pot ✅, main+side on short all-in ✅, uncalled-bet refund ✅, three stacked all-ins ✅, folded chips stay but unwinnable ✅, conservation across mixed scenarios (Σpots+Σrefunds==Σcontrib, every pot has an eligible) ✅, empty hand ✅.
- **Command:** `npx jest side-pots`
- **Status:** PASSED — 7/7. Caught & implemented uncalled-bet refunds (real betting can produce a lone top contributor). Full suite 126/126; build green.

### STEP C5 — Full hand state machine ✅
- **Build:** `PokerHand` orchestrator — deal → preflop/flop/turn/river betting (carrying contributions, skipping streets when all-in) → side pots → showdown → award (split + odd-chip to earliest seat) + uncalled refunds. Positional rules documented.
- **Gate:** 6 scripted full hands — AA>KK whole pot ✅, fold-preflop wins blinds (+refund) ✅, split pot even ✅, odd chip to earliest seat ✅, all-in main+side pot (short wins main, side decided between others) ✅, lifecycle guards ✅; every scenario asserts winners, exact payouts, **chip conservation**, and seed verifies.
- **Command:** `npx jest hand.spec`
- **Status:** PASSED — 6/6. Full suite 132/132; build green.

### STEP C6 — Settlement into the ledger ✅
- **Build:** `SettlementService.settleHand()` — one balanced double-entry txn per hand: buy-in (PLAYER → PRIZE_POOL escrow), final stack return (escrow → PLAYER), rake (escrow → HOUSE_RAKE). Idempotent per hand; balances against engine result.
- **Gate:** 5 tests — real engine hand settles + wallets match result + escrow → 0 ✅; rake to house + conservation ✅; unbalanced rejected ✅; insufficient buy-in rejected ✅; settle-once idempotency ✅. Whole-system Σ entries == 0.
- **Command:** `npx jest settlement`
- **Status:** PASSED — 5/5. Full suite 137/137; build green. **Milestone C (poker engine) COMPLETE.**

---

## MILESTONE D — Realtime multiplayer
> Now wrap the proven engine in Socket.IO. The engine is already trusted by gates above.

### STEP D1 — Authenticated socket connect ✅
- **Build:** `GameGateway` (Socket.IO) — handshake auth via `auth.token` or Bearer header, verifies JWT, attaches user to `socket.data`, emits `connected`; rejects + disconnects otherwise. `RealtimeModule` wired into `AppModule`.
- **Gate:** 4 e2e socket tests — valid JWT connects (userId echoed) ✅, no token rejected ✅, garbage token rejected ✅, wrong-secret token rejected ✅.
- **Command:** `npx jest socket-auth`
- **Status:** PASSED — 4/4 (added `forceExit` for clean socket teardown). Full suite 141/141; build green.

### STEP D2 — Table join/leave + seating ✅
- **Build:** `TableService` (in-memory seats, deals hole cards when ≥2 seated, public state with `hasCards` only); gateway `table:join`/`table:leave` — joins room, broadcasts public `table:state`, sends `hand:hole` privately to each owner's socket.
- **Gate:** 4 e2e tests — two clients seated, private hole cards (all 4 distinct), **public state never contains any hole card** ✅; full table rejected ✅; same-user double-seat rejected ✅; leave frees the seat ✅.
- **Command:** `npx jest table.e2e`
- **Status:** PASSED — 4/4. Full suite 145/145; build green.

### STEP D3 — Play a hand over sockets ✅
- **Build:** `TableService` drives a live `PokerHand` (auto-starts at 2 seated, fixed buy-in chips); gateway `hand:action` validates via engine, broadcasts `game:state` per turn, emits `hand:result` at showdown and **settles the result into the ledger** (C6).
- **Gate:** e2e — two authenticated, funded bot clients play heads-up to showdown over real sockets; wallets end exactly equal to the engine's final stacks, money conserved (Σ=200, ledger nets 0), winner credited > 0.
- **Command:** `npx jest play.e2e`
- **Status:** PASSED — 1/1. (3-player auto-start raced with the 3rd join → deferred N>2 start semantics as a documented product decision.) Full suite 146/146; build green.

### STEP D4 — Reconnection ✅
- **Build:** seat persists across disconnect (hand never abandoned); `TableService.reconnect()` re-binds the new socket; gateway `table:rejoin` replays public state + private hole cards + current `game:state` to the reconnecting socket. (In-memory resume now; Redis-backed state deferred to hardening — see note.)
- **Gate:** 2 e2e tests — drop mid-hand (on A's turn, frozen), reconnect on a new socket → hole cards & game state restored identically, hand resumes to showdown, settlement conserved ✅; rejoin to an unsat table rejected ✅.
- **Command:** `npx jest reconnect.e2e`
- **Status:** PASSED — 2/2. Full suite 148/148; build green. **Milestone D (realtime multiplayer) COMPLETE.**

> Redis-backed live state (D-plan original) deferred to Milestone G hardening for multi-instance scale; in-memory resume proves the reconnection UX now.

---

## MILESTONE E — Admin panel (React-Admin, web)
### STEP E1 — Admin auth + read views ✅
- **Build:** `AdminGuard` (DB-backed ADMIN role check, runs after JwtAuthGuard); `AdminService`/`AdminController` — `GET /admin/players` (with balances) and `GET /admin/withdrawals?status=` (amounts as strings, BigInt-safe). `AdminModule` wired in.
- **Gate:** 4 e2e tests — admin lists players+balances ✅, admin lists pending withdrawals ✅, non-admin → 403 ✅, no token → 401 ✅.
- **Command:** `npx jest admin.e2e`
- **Status:** PASSED — 4/4. Full suite 152/152; build green.

### STEP E2 — Mark withdrawal paid/rejected ✅
- **Build:** `POST /admin/withdrawals/:id/approve` and `/reject` (admin-guarded) calling A3 `WithdrawalService`; responses BigInt-safe via `serializeWithdrawal`.
- **Gate:** 4 e2e tests — approve → PAID + money leaves + ledger nets 0 ✅; reject → funds restored ✅; settle-twice → 400 ✅; non-admin → 403 and withdrawal stays REQUESTED ✅.
- **Command:** `npx jest admin-withdrawals`
- **Status:** PASSED — 4/4. Full suite 156/156; build green. **Milestone E (admin API) COMPLETE.**

> The React-Admin web UI is a separate frontend that consumes these endpoints; the admin **API** (the testable backend half) is done.

---

## MILESTONE F — Mobile app (Flutter, Android)
> Requires installing the Flutter SDK first (not yet on this machine).

### STEP F1 — Flutter project + login ✅
- **Build:** Flutter SDK 3.44.1 + JDK 17 + Android SDK 36 installed (`~/.capa_flutter_env.sh`). `mobile/` app: brand theme from design tokens, injectable `AuthApi` (→ backend `/auth/otp/*`), two-step phone-OTP `LoginScreen` → `HomeScreen`.
- **Gate:** `flutter analyze` clean ✅; `flutter test` 3/3 (valid OTP→home, wrong code→error, 429→friendly msg, offline via MockClient) ✅; `flutter build apk --debug` → real installable `app-debug.apk` ✅.
- **Command:** `cd mobile && flutter test`
- **Status:** PASSED — 3/3 + APK built. ⚠️ No `/dev/kvm` here, so emulator can't run in this env; APK runs on a real device. Backend reachable at `10.0.2.2:3000` (emulator) / host LAN IP (device).
### STEP F2 — Lobby + table list ✅
- **Build:** backend `GET /tables` (JWT-guarded) — 7 Poker room levels with entry fees (from PRIZE_RULES) + live seat counts from realtime TableService. Flutter `LobbyScreen` (FutureBuilder list, BRL formatting, live counts) reached after login.
- **Gate:** backend 2 e2e (401 unauth; 7 rooms, ascending levels/fees) ✅; Flutter 2 widget tests (renders rooms + currency + seat counts; error state) ✅; login now lands on lobby ✅.
- **Command:** `npx jest tables.e2e` · `cd mobile && flutter test`
- **Status:** PASSED — backend 183/183; Flutter 5/5; both analyze/build clean. (Caught: http latin1-default encoding needs charset=utf-8 in test mocks for em-dash.)
### STEP F3 — Poker table UI + gameplay ✅
- **Build:** `GameConnection` abstraction (socket-backed `SocketGameConnection` via socket_io_client; translates connected/game:state/hand:hole/hand:result into `GameSnapshot`). `TableScreen` renders board + private hole cards + turn banner + legal-action buttons (fold/check/call direct; bet/raise via amount dialog). Lobby tap → table over real socket.
- **Gate:** 5 widget tests (board/hole/turn render, action dispatch, hidden buttons off-turn, result banner, error state) via a fake connection ✅. Manual two-device showdown is the real-world confirmation (can't run headless).
- **Command:** `cd mobile && flutter test`
- **Status:** PASSED — Flutter 10/10 (login+lobby+table); analyze clean; APK builds. **Milestone F & the entire test-gated plan COMPLETE.**

---

## MILESTONE G — Hardening & launch prep
### STEP G1 — Prize table ✅  (room-occupancy %, 7 levels)
- **Build:** `prize-table.ts` — `multiplierFor(occupancy)` (configurable 7-band 20×→200× V.I. schedule), `computePrizePool` (money-safe: prize capped at collected; prize+rake==collected), `distributePrize` (integer-cent split, remainder to top places).
- **Gate:** 14 tests — full→200×, empty→20×, mid bands, monotonic ✅; prize pool conservation + low-occupancy cap + invalid inputs ✅; distribution exactness/remainder/guards ✅.
- **Command:** `npx jest prize-table`
- **Status:** PASSED — 15/15. Full suite 171/171; build green. ✅ REAL CAPACONTEST.pdf tiers now locked in (10 bands 20×→200×, <10%→0 flagged). Full ruleset (capacity, eliminatory phases, loser %, entry fees, prize-share %) recorded in [PRIZE_RULES.md](PRIZE_RULES.md). Eliminatory/loser/subscription engines deferred to their own modules (data captured).
### STEP G2 — Reconciliation job ✅  (cached balances == Σ ledger; system nets 0)
- **Build:** `ReconciliationService` — `checkAccounts` (cache vs ledger sum), `checkSystemBalance` (Σ entries == 0), `run` (full report + error log), `repairCachedBalances` (reset cache to ledger truth). Wire to a nightly cron/admin button at deploy.
- **Gate:** 4 tests — healthy → ok ✅; detects corrupted cache row (diff reported, ledger truth intact) ✅; repair fixes drift ✅; detects an unbalanced/injected ledger entry (system imbalance) ✅.
- **Command:** `npx jest reconciliation`
- **Status:** PASSED — 4/4. Full suite 175/175; build green.
### STEP G3 — Rate limiting + audit log ✅  (error tracking = deploy config)
- **Build:** per-phone OTP request rate limit (5/min sliding window → 429); `AuditLog` model + migration + `AuditService`; admin approve/reject now write an immutable audit record (actor, action, target, amount).
- **Gate:** 4 e2e tests — 6th rapid OTP → 429 ✅, limit is per-phone ✅, approve writes audit record ✅, reject writes audit record ✅.
- **Command:** `npx jest g3-hardening`
- **Status:** PASSED — 4/4. Full suite 179/179; build green.
- **Note:** Sentry/error-tracking is a deploy-time wiring (DSN + init), not unit-testable here — add at deployment. A global HTTP throttler (@nestjs/throttler) is also recommended for prod breadth.
### STEP G4 — Full system e2e + load smoke ✅
- **Build:** end-to-end test through real public interfaces (register/OTP/admin via HTTP, gameplay via sockets). Concurrency hardening it surfaced: race-safe `ensureAccount` (P2002 fallback for singleton system accounts) + retry-on-write-conflict (P2034) in `LedgerService.post`.
- **Gate:** 2 e2e tests — full journey (register → OTP login → JWT → join → play hand → settle → reconcile → admin views) ✅; load smoke (4 concurrent tables all settle, system reconciles, total wallets == total deposited) ✅.
- **Command:** `npx jest system.e2e`
- **Status:** PASSED — 2/2. Full suite 181/181; build green. **Milestone G & the entire backend plan COMPLETE.**

---

## Cross-cutting gates (run before every commit)
```
cd backend && npm run build && npx jest        # all green
docker compose ps                              # infra healthy
```
> Definition of done for a step = its own gate green **AND** the full suite still green
> (no regressions). Only then do we move on.
