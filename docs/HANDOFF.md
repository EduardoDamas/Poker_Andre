# CAPA CONTEST — Handoff & Setup (run on another machine)

Everything needed to continue development, build, and deploy on a **new computer**.
Committed to git, so it travels with the repo. **Secret values are NOT here** — they
live in gitignored files you copy manually (see §2).

Last updated: 2026-09-22. App version live: **1.0.7+25** (next: 1.0.8, see §10).

---

## 0. What this project is

- **CAPA CONTEST** — Android Texas Hold'em app (Brazil, real-money via card), distributed by
  **direct APK link** (NOT the Play Store — Play rejected skill-game + real money).
- **backend/** — NestJS + Prisma + PostgreSQL. Deployed on **Render** (Docker).
- **mobile/** — Flutter app (Android).
- **admin/** — React + Vite admin panel; also served by the backend at `/panel`.
- Money is a **double-entry ledger in integer cents** (never floats). A separate **virtual
  points economy** (free/paid points, daily wheel, streaks) is unrelated to the BRL wallet.

---

## 1. Prerequisites (install on the new machine)

| Tool | Version used | Notes |
|---|---|---|
| Node.js + npm | Node 20+ | backend + admin |
| Flutter SDK | stable (Dart 3.12+) | was at `C:\flutter` (not on PATH → call `C:\flutter\bin\flutter.bat`) |
| Android SDK | build-tools 36.0.0 | was at `C:\Android\Sdk`; `apksigner` under `build-tools\36.0.0\` |
| JDK | 17 | bundled with Android Studio / Flutter |
| PostgreSQL | 17 | local dev + tests only (prod DB is on Render) |
| gh CLI | 2.x | for GitHub Releases (APK upload) |
| Git | any | pushes use a token-in-URL (see §3) |

---

## 2. Secret files to copy manually (DO NOT COMMIT)

These are **gitignored on purpose**. Copy them from the old machine (USB / secure channel),
place at the same paths. Without them you cannot deploy, push, or sign the app.

| File | Contains | Used for |
|---|---|---|
| `.gh-token.txt` | GitHub classic PAT (scope `repo`) for user `EduardoDamas` | pushing to the deploy repo. **Expires** — regenerate at github.com/settings/tokens |
| `.render-key.txt` | Render API key | triggering deploys, reading logs, setting env vars |
| `backend/.env` | `DATABASE_URL`, `JWT_SECRET`, `ADMIN_*`, etc. | local backend/dev + tests |
| `admin/.env` | `VITE_API_BASE` (local: `http://localhost:3000`) | admin dev server |
| `mobile/android/key.properties` | keystore passwords + alias (`upload`) | signing release APKs |
| `mobile/android/upload-keystore.jks` | **THE release keystore** | signing. **CRITICAL — losing it blocks all future app updates.** Back it up separately. SHA-1 `51:80:26:C3:1C:F4:FD:36:87:88:28:80:0F:02:44:49:AB:54:31:8F` |

> Never aggregate these into one committed file. If a secret is lost: PAT → regenerate;
> Render key → Render dashboard; keystore → **cannot be regenerated** (see the release-keystore note).

Live credentials you'll also need (keep out of git):
- **Admin panel** `https://capa-contest-api.onrender.com/panel` → username and password are the
  `ADMIN_USERNAME` / `ADMIN_PASSWORD` env vars on Render. Rotated 2026-09-17 to values only the
  client holds — ask him, or set new ones in Render (then redeploy). Case-sensitive.
- **Render**: owner `mastercred962@gmail.com`, service `srv-d9rlhdf40ujc73bpamj0`.
- **InfinitePay**: handle `andre-luiz-g4j`; `INFINITEPAY_WEBHOOK_SECRET` is set on Render.

---

## 3. Get the code + push setup

A fresh clone has a single remote, `origin` → `EduardoDamas/Poker_Andre` (**public**; Render
deploys from its `main`). The older machine also tracked `aaroncastro5678913-cpu/winpoker`
(read-only); it is not needed.

Clone the deploy repo on the new machine:
```
git clone https://github.com/EduardoDamas/Poker_Andre.git Poker
```
Push (credential helpers get overridden, so use a token-in-URL):
```
tok=$(tr -d '\r\n' < .gh-token.txt)
git push "https://x-access-token:${tok}@github.com/EduardoDamas/Poker_Andre.git" HEAD:main
```
Push whatever branch you are on to `main` (`HEAD:main`). The `gh` CLI on the 2026-09 machine was
logged in as a different account; for releases use `GH_TOKEN=$(tr -d '\r\n' < .gh-token.txt)` so
they are created as `EduardoDamas`.

---

## 4. Backend — install, dev, test

```
cd backend
npm install
npx prisma generate
# dev (needs a reachable DATABASE_URL):
npm run start:dev            # nest start --watch
npm run build                # nest build (no DB needed)
```

**Tests** need a local Postgres. IMPORTANT gotcha (see §8): port **5434 is broken** on the old
machine — tests were run on **5544**:
```
# start PG on 5544, then:
TEST_DATABASE_URL="postgresql://capa:capa_dev_password@localhost:5544/capa_contest_test?schema=public" npx jest --runInBand
```
Full suite is **413 passing / 57 suites**. On the 2026-09 machine port 5434 works fine
(PostgreSQL 17 installed locally), so the plain `.env` setup is used there. On a healthy machine, plain `npx jest` with the
`.env` `DATABASE_URL` works (the jest globalSetup runs `prisma migrate deploy`). The two
80-entrant multi-table specs take ~25-60s each, so they need `--testTimeout=120000` on a
slower machine (the default is 20s).

Migrations apply automatically on Render boot (`prisma migrate deploy` in the Docker CMD).

---

## 5. Mobile — build the APK

```
cd mobile
C:\flutter\bin\flutter.bat pub get
C:\flutter\bin\flutter.bat analyze lib
C:\flutter\bin\flutter.bat test
C:\flutter\bin\flutter.bat build apk --release
```
Output: `mobile/build/app/outputs/flutter-apk/app-release.apk`. Signing is automatic when
`android/key.properties` + `upload-keystore.jks` are present (else it falls back to debug
signing — a debug-signed APK will NOT install over the real one). Verify:
```
"C:\Android\Sdk\build-tools\36.0.0\apksigner.bat" verify --print-certs app-release.apk
# expect SHA-1 51:80:26:...:31:8F
```
Staged builds are copied to `mobile/dist/capa-contest-<version>.apk` (gitignored).
Default backend URL is baked in `mobile/lib/config.dart` → `https://capa-contest-api.onrender.com`.

Launcher icon: `flutter_launcher_icons` config in pubspec → `dart run flutter_launcher_icons`.

---

## 6. Admin panel

Local: `cd admin && npm install && npm run dev` → http://localhost:5173 (point at prod with
`VITE_API_BASE=https://capa-contest-api.onrender.com`). Hosted: the built panel is bundled into
`backend/panel/` and served at **`/panel`** (rebuild with `npm run build` in admin/, copy `dist`
→ `backend/panel/`, redeploy). Login is `ADMIN_USERNAME` + `ADMIN_PASSWORD` (Render env).
**Build the hosted panel with `VITE_API_BASE=https://capa-contest-api.onrender.com`** — `admin/.env`
points at localhost and Vite applies it to production builds too, which would break the live panel.
Check the bundle has no `localhost` before committing `backend/panel/`.

---

## 7. Deploy (backend → Render)

**Deploys are manual in practice.** The Render API reports `autoDeploy: yes`, but a push to
`main` did NOT trigger a deploy (2026-09-16) — the GitHub webhook is not reaching Render, so
reconnect the repo in the service's Settings → Build & Deploy if you want pushes to deploy.
Until then, after pushing, deploy by hand: dashboard → `capa-contest-api` → **Manual Deploy** →
**Deploy latest commit**, or via the API:
```
rk=$(tr -d '\r\n' < .render-key.txt)
sid="srv-d9rlhdf40ujc73bpamj0"
curl -s -X POST -H "Authorization: Bearer ${rk}" -H "Content-Type: application/json" \
  "https://api.render.com/v1/services/${sid}/deploys" -d '{}'
# poll GET .../deploys/<id> until "live"; then check /health
curl -s https://capa-contest-api.onrender.com/health
```
Read logs (ownerId `tea-d9rkvfv40ujc73bo5pc0`):
```
curl -s -H "Authorization: Bearer ${rk}" \
  "https://api.render.com/v1/logs?ownerId=tea-d9rkvfv40ujc73bo5pc0&resource=${sid}&limit=50"
```
Set an env var (e.g. to rotate the panel password):
```
curl -s -X PUT -H "Authorization: Bearer ${rk}" -H "Content-Type: application/json" \
  "https://api.render.com/v1/services/${sid}/env-vars/ADMIN_PASSWORD" -d '{"value":"<new>"}'
# then trigger a deploy for it to take effect
```

---

## 8. Environment gotchas (bit us repeatedly)

- **Astrill VPN.** Its OpenWeb mode registers a **Winsock LSP (`ASProxy64.dll`)** that injects
  into the JVM and **crashes every Gradle build**. Fix: `netsh winsock reset` (admin) + reboot;
  keep Astrill on **WireGuard/OpenVPN**, never OpenWeb. Also: Astrill **severs large uploads** —
  the 60 MB GitHub-release APK upload fails via CLI; use the **GitHub web UI** to attach the APK,
  or turn Astrill off for the upload.
- **Port 5434 is broken** at the OS level ("could not bind ... Permission denied") — Postgres
  won't listen there. Use another port (we used **5544**) for local tests.
- **Android emulator crashes** on the old machine (GPU/`UpdateLayeredWindowIndirect` + socket
  errors), even with `-gpu swiftshader_indirect`. Automated screenshots weren't possible there —
  test on a real device.
- **Gradle file locks**: an occasional "file is being used by another program" on build — stop
  the daemon (`cd mobile/android && ./gradlew --stop`) and rebuild.

---

## 9. Current state & what's live

- **Prod API:** https://capa-contest-api.onrender.com — commit `59d46d7` (2026-09-17).
- **Install page:** https://capa-contest-api.onrender.com/baixar — shows operator identity
  (ANDRE LUIZ LABADESSA LTDA · CNPJ 67.550.569/0001-00), support WhatsApp (13) 99600-1429 and
  LABA29@YAHOO.COM, matching the legal documents. Says "deposite com cartão, saque por Pix".
- **APK download:** `https://github.com/EduardoDamas/Poker_Andre/releases/download/v1.0.7/CAPA-CONTEST.apk`
  (GitHub Release asset). To publish a build: create a new release with the APK, then update the
  link in `backend/public/install.html` (+ `docs/marketing/install.html`) and deploy — the public
  `/baixar` URL never changes. Releases so far: v1.0.3, v1.0.5, v1.0.6, v1.0.7.
- **Card payments (InfinitePay):** LIVE + validated with a real R$1 charge. Card-only for now
  (Pix disabled at InfinitePay per client). Deposit button mints a checkout link; webhook credits
  the wallet (`parseWebhook` treats `paid_amount`+`transaction_nsu` as paid). Deposits are capped
  at R$20.000 each (`MAX_DEPOSIT_CENTS`).
- **Admin panel credentials** were rotated on 2026-09-17 to values only the client holds. They
  live **only** in Render's `ADMIN_USERNAME` / `ADMIN_PASSWORD` — never in the repo or in notes.
  Both are case-sensitive.
- **Legal:** Termos, Privacidade (LGPD, names a DPO), Regulamento and Exclusão de conta are live at
  `/legal/*`. Registration records consent (`termsAcceptedAt`, `termsVersion`).
- **Infrastructure:** Render web service on the **Starter** plan, **1 instance**, Oregon; Postgres
  `capa-postgres` on **basic_256mb** (v16). No load test has been run.
- **Capacity (be exact when asked):** accounts/downloads are unlimited. Money tournaments are 7
  rooms x 8 seats = **56 players at once** today (each room runs one tournament at a time, then
  frees for the next group). The 10-minute format raises that to 7 x 80 = 560. Game state is
  **in memory in one process**, so scale the instance up, not out — more instances would split
  the state (see §10).
- **Features shipped:** poker engine, tournaments (7 levels), auto card deposit, virtual points +
  daily lucky wheel + streak milestones, rankings, winners feed, share-your-win (+5000 points),
  subscriptions via the client's fixed links (admin releases them), responsible-gaming limits +
  self-exclusion, consent at signup, password recovery, overdraft-safe ledger, admin panel with
  player counters / limits column / Assinaturas tab.
- **Marketing:** Meta ads approved; Google campaign running since 2026-09-20 (account validated,
  landing-page content under review). CTR ~10%, ~96% of clicks on smartphones.

---

## 10. Pending tasks (backlog)

- [ ] **PROMOÇÃO "Nível 0" — quarta 07/10/2026 (5º dia útil de outubro)** — free entry, ONE
      prize: R$500 if the winner is a subscriber, R$250 if not; the goal is new subscriptions.
      Client spec (2026-09-21): 10 tables x 8 → 1 per table → final table of 8 → champion, ~15 min.
      **The spec does not add up:** 10 tables leave 10 winners, not 8. Offered: (A, recommended)
      8 tables = 64 players → final table of 8; or (B) 80 players → two semi-finals of 5 → final.
      **Waiting on the client:** A or B, start time, minimum registrations (suggested 16), and the
      subscriber rule (suggested: "assinante até o início do torneio").
      **Needs:** the multi-table app wiring (same as the 10-minute rooms) + app **1.0.8** + players
      updating; a house-funded prize (a new money flow — there are no entries to fund it); turbo
      blinds to get near 15 min (realistically 15–25).
      **Plan agreed with the client:** answers by 24/09 → built and tested with 64 simulated
      players by 01/10 → 1.0.8 published 02/10 → **real-phone rehearsal 05–06/10** (a multi-table
      tournament has never run on real devices) → promo 07/10.
      **Plan B:** if the rehearsal fails, run it as today's single 8-seat table, which needs no app
      update — the date and prize stay.
      **Done (2026-09-22): the company-funded prize** — `src/promo/` (`PromoService`, `PromoEvent`
      table). Paid from a dedicated `PROMOTIONS` account (its balance = total promo spend, kept
      apart from `HOUSE_RAKE`), ledger kind `PROMO_PRIZE`, exactly one prize per event even under
      racing awards (unique ledger reference; a losing racer reads the ledger, not the event row),
      blocked winners held, recorded as a level-0 win for the winners feed. The subscriber flag is
      the caller's snapshot at tournament start. **Next:** free entry + the event's room/bracket,
      then the scheduled start.
- [ ] **Validate subscriptions Opção 2 BEFORE the promo** — the promo's goal is subscriptions, and
      today each one waits for a manual release in the panel. One small real purchase, then set
      `SUBSCRIPTION_CHECKOUT=dynamic`, so late subscribers are not counted as non-subscribers.
- [~] **10-minute scheduled rooms** (client spec, 2026-09-17: a room per level opens every 10 min;
      80 seats = 100% occupancy; pool capped at 50% of what came in; nobody joins mid-tournament).
      **Built:** `settle(prizePoolSharePct)`, `refundEntries`/`refundEntry` (TOURNAMENT_REFUND
      kind), `ScheduledRoomsService` (clock-aligned windows, durable `RoomRegistration` table,
      register / cancel, `closeWindow` start-or-refund) and a **hard floor**: a window never runs
      below the occupancy where the prize table pays (8 of 80) — below it the house would keep every
      cent. Settings: `ROOM_MIN_PLAYERS`, `TOURNAMENT_WINDOW_MINUTES`, `PRIZE_POOL_SHARE_PCT` (50).
      **Pending:** the tick timer, the gateway wiring (seat rosters across tables and play the
      bracket), the app (schedule screen, countdown, register) and an APK. The existing multi-table
      settle still passes `capacity: MAX_PLAYERS` (800) — must become `ROOM_SEATS` (80) when wired.
      **Economics:** in this format the winner gets 12% of the money in (25% share of a 50% pool),
      so 8 players pays R$20 vs R$40 today. Recommend keeping the client's minimum of 40 and letting
      today's 8-seat rooms serve low traffic, rather than lowering the minimum for launch.
      **Open with the client:** run both formats side by side, or replace today's.
- [ ] **Waiting panel** (`mobile/lib/widgets/waiting_panel.dart`) — built and tested, NOT in 1.0.7.
      Ships with 1.0.8. Its "tempo estimado" box stays hidden until the scheduler supplies a start.
- [x] **Publish `1.0.7+25`** — released and `/baixar` points at it (2026-09-17).
- [x] **Overdraft race fixed** — `LedgerService.post` takes `requireNonNegative`, checked inside
      the serializable transaction, so concurrent debits (two rooms, two withdrawals, or a
      withdrawal racing an entry) can no longer push a wallet negative. See `wallet/overdraft.spec.ts`.
- [x] **Password recovery** — "Esqueci minha senha" in the app: `POST /auth/password/forgot`
      sends a code, `POST /auth/password/reset` sets the new password and returns a session.
      Reuses the OTP machinery (single-use code, 5 attempts, 5 requests/min per phone) and says
      the same thing for unknown numbers, so it cannot be used to discover accounts. Blocked
      accounts get no code.
- [ ] **Choose the code delivery channel** — recovery works, but production still runs
      `OTP_PROVIDER=dev`, so codes only reach the panel's **Códigos OTP** tab for an admin to
      relay. Set `OTP_PROVIDER=whatsapp` (+ Meta creds) or `twilio` for players to get them
      directly; both providers are already in the code.
- [x] **Rotate the admin panel password** — done 2026-09-17 (values only in Render env).
- [x] **Subscriptions purchase (Opção 1)** — the client's four fixed InfinitePay links
      (`SUBSCRIPTION_LINKS` in `backend/src/tournament/payment-links.ts`). The player taps a plan,
      we record a `SubscriptionRequest`, and the admin releases it in the panel's **Assinaturas**
      tab after checking the payment in InfinitePay (Mensal 30 · Trimestral 90 · Semestral 180 ·
      Anual 365 dias; a renewal extends from the current expiry).
- [~] **Subscriptions purchase (Opção 2)** — built, OFF by default. Set `SUBSCRIPTION_CHECKOUT=dynamic`
      on Render to switch on: `/payments/subscription-request` then mints a per-player checkout
      (`PaymentOrder` with purpose SUBSCRIPTION, `orderNsu` on the `SubscriptionRequest`) and the
      webhook releases the plan with no admin step — it never credits the wallet. If the gateway
      call fails it falls back to the merchant's fixed link, so the player can always pay.
      **Before switching on:** validate with one real purchase like the R$1 deposit test, because
      the subscription flow has only been exercised against a stubbed gateway. Unset the variable
      to go back to Opção 1 (fixed links + admin confirms). The app needs no new build either way.
- [ ] **Repo hygiene** — untracked theme-asset `.zip`s + duplicated extract folders under
      `mobile/assets/` should be gitignored/removed.
- [ ] **Fix Render auto-deploy** — the GitHub webhook does not reach Render (every deploy this
      month was a manual click). Reconnect the repo in Settings → Build & Deploy.
- [ ] **CAPA domain** — bought by the client, not pointed yet. Point it at the service, then move
      the legal URLs, the landing page and ideally the support/DPO e-mail (today a Yahoo address)
      onto it. Ad platforms prefer policy and site on the same domain; Search Console needs it.
- [ ] **Google Ads category** — asked the client's agency whether the ad is reviewed under the
      real-money gaming policy (often needs advertiser certification even for skill games). If
      so, page content alone will not get it approved.
- [ ] **Load test before a big campaign push**, and plan for horizontal scale: tournament state is
      in memory in one process, so capacity grows only with a bigger instance until that changes.
- [x] **Consent at registration** — the app asks the player to accept Termos + Privacidade +
      Regulamento (links open the live `/legal/*` pages) and the server stores `termsAcceptedAt`
      + `termsVersion` (`auth/legal-version.ts`). Bump `LEGAL_VERSION` when the lawyer issues new
      documents.
- [ ] **Make `acceptedTerms` required** — it is optional on the wire so 1.0.6 and older installs
      (no checkbox) keep registering; those accounts store no consent. Once nobody is on ≤1.0.6,
      make it mandatory and consider prompting existing players to accept on next login.
- [ ] **Show consent in the admin panel** — `termsAcceptedAt`/`termsVersion` are recorded but not
      surfaced, so support cannot answer "did this player accept, and when?".
- [ ] **AVISO LEGAL** — the client asked for it (2026-09-17); the document is not in the repo.
      Get the file from him, then publish it like the others (`backend/legal/*.html` + a route in
      `legal.controller.ts` + a link in the app).
- [ ] **"REGRAS" (`docs/legal/DESCRICAO_JOGOS_E_REGRAS.md`) is NOT published, on purpose** — it
      describes 800-player rooms with eliminatory phases and re-entry, which is the Phase-2 model,
      not what the app runs (one 8-seat table = one room). It also still carries a
      `[DATA DE VIGÊNCIA]` placeholder and says it needs legal review. The published
      **Regulamento dos Torneios** already covers the rules and is careful about this ("Na Fase 1,
      uma Mesa de até 8 participantes poderá representar uma Sala"). Either have the lawyer update
      the description to match Fase 1, or derive a player-facing "Regras do jogo" page from the
      Regulamento — publishing it as-is would promise a format the app does not offer.
- [x] **Legal exclusão/limites** — real in-app tool (`backend/src/responsible/`, app screen
      `mobile/lib/screens/limits_screen.dart`). The player sets deposit ceilings per rolling
      day/week/month and can self-exclude. Lowering applies at once; raising waits
      `COOLING_OFF_HOURS` (24h) so protection can't be undone on impulse; self-exclusion can be
      extended, never shortened, and blocks deposits (both paths) and money tables.
- [x] **Player limits visible in the admin panel** — the Jogadores tab has a Limites column
      (ceilings, or AUTOEXCLUÍDO with the end date).
- [ ] **Deposit limits vs. the R$20.000 technical cap** — the cap
      (`MIN/MAX_DEPOSIT_CENTS`) is a safety net against typos and stolen cards, separate from
      the player's own limits. The client asked for no cap at all (2026-09-16); revisit once
      the self-imposed limits have been in use for a while.

---

## 11. Where else to look

- `docs/` — SCOPE, PRIZE_RULES, DEPLOY, legal (final PDFs), marketing kit (`docs/marketing/`),
  design prompt book (`docs/design/`).
- `RESTORE.md` / `CLAUDE_HANDOFF.md` — older local-only notes (gitignored); this file supersedes them.
- Claude Code's memory (`~/.claude/.../memory/`) is machine-local and does NOT travel with the
  repo — this doc is the source of truth for a new machine.
