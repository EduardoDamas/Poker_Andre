# End-to-end test of the app (real client code ↔ real server)

`mobile/test_e2e/app_e2e_test.dart` drives the **app's own classes** — `AuthApi`
(register, login, password reset, deposit), `TablesApi`, `PaymentsApi`, `LimitsApi` and
`SocketGameConnection` with its `GameEvents` — against a running backend over HTTP and
Socket.IO, and asserts on what the app would show (`GameSnapshot`). No emulator needed.
A TCP relay inside the test cuts some phones' connections to simulate network loss.

## Run it (≈3 min)

```bash
# 1. a server with short timings (local DB from backend/.env; ADMIN_OPEN=1 so the test can act as the organizer)
cd backend && npm run build
PORT=3300 ADMIN_OPEN=1 TOURNAMENT_HAND_DELAY_MS=150 BRACKET_ROUND_DELAY_MS=500 \
  TURN_TIMEOUT_MS=2500 TOURNAMENT_DISCONNECT_GRACE_MS=3000 ROBOT_DELAY_MS=30 node dist/main.js

# 2. the test (another terminal)
cd mobile && flutter test test_e2e/app_e2e_test.dart --dart-define=E2E_API=http://127.0.0.1:3300
```
Do not run the backend jest suite at the same time: it truncates the same database.

## What it covers (10 scenarios)

| Scenario | Checks |
|---|---|
| Account | register (valid CPF, terms) → login → wrong password → duplicate phone → forgot password with the OTP → new password |
| Before the day | lobby lists the promotion with its date, "Grátis", 100 places; joining early says when the room opens |
| Waiting room | places counted live; "Sair" gives a place back; full → "vagas"; starts at its time; late join → "já começou"; champion paid R$250 |
| Real format | **100 phones**: 10 tables of 10 → final table of the 10 winners → one champion paid R$250; every other phone told its place; no table win shown as the tournament; turn clock shown |
| Things go wrong | AFK phone (clock plays for it), 1-s network drop (reconnects, keeps its seat), drop longer than the grace (told it is out; "Reconectando…" meanwhile), quitting mid-tournament — it still ends with one champion |
| Self-exclusion | refused |
| Subscribers | subscribed at the start → R$500; plan bought in the app before the start and released after it → R$500 |
| Rehearsal | 1 phone + 25 robots, 4 tables → final; nothing paid |
| Paid rooms | deposit → confirmed in the panel → Nível 1 heads-up → winner paid, loser −R$20 |

## Screens at phone size

`mobile/test_e2e/screens_test.dart` renders the promotion's key screens (lobby, waiting room,
my turn at a table of 10, table won, eliminated, champion, reconnecting, too early, leave
warning) at 360×780 dp with real fonts to PNGs, for a human look:
```bash
cd mobile && flutter test test_e2e/screens_test.dart --dart-define=SHOTS_DIR=C:/tmp/shots
```
(Card suits and the AppBar title show as boxes: the test has only Roboto; phones render them.)

## Found and fixed by the first run (2026-09-25)

1. **Tables froze forever** when a hand was over as dealt — every player all-in from the
   blinds (they double every 3 hands). Nobody could act, so the result was never booked.
   Hit the 100-phone promotion (no final table) and would hit paid rooms too (prize never
   paid). Fixed server-side (`TableService.completeDealtHand`, gateway `afterDeal`).
2. **App reused the first socket for every table** (socket_io_client caches by URL): after
   logging in as someone else, or after a token expired and a new login, tables still used the
   old session. Fixed with `enableForceNew()` (app 1.0.9).
3. **Back button forfeited the tournament silently** (AppBar arrow and Android back). Now asks
   first while in the bracket or the waiting room (app 1.0.9).
4. **"Falha de conexão." looked final** during a network drop the app recovers from by itself.
   Now "Conexão perdida. Reconectando…" with a spinner (app 1.0.9).
5. **Server restart mid-tournament** (deploy/crash) would have started a new tournament with
   the first two phones to reconnect. Now refused ("O torneio foi interrompido…") and the panel
   shows INTERROMPIDA with **Remarcar**.
6. Layout at 360 dp: waiting room cut off the invite button; "Aumentar" didn't fit; at a table of
   10 seats overlapped the board and the round label. Fixed (app 1.0.9).
