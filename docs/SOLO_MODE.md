# Solo Mode — play vs AI bots, offline

Solo Mode runs the **entire poker engine and the AI bots on the device** — no
backend, no socket, no IP, no login. It's the simplest way to play and demo.

## What it is (and the "mod" framing)
This project is a Flutter app + NestJS backend, not a moddable game engine — so
"solo mod" is implemented as an **offline Solo Mode** built additively:

- The tested TypeScript poker engine (`backend/src/poker/`) was **ported to Dart**
  under [`mobile/lib/engine/`](../mobile/lib/engine/): `cards`, `evaluator`,
  `betting`, `side_pots`, `poker_hand` — same rules, verified by Dart unit tests
  (`mobile/test/engine_test.dart`).
- AI opponents: [`engine/bot.dart`](../mobile/lib/engine/bot.dart) — decisions by
  hand strength + difficulty.
- [`game/local_connection.dart`](../mobile/lib/game/local_connection.dart)
  (`LocalGameConnection`) implements the **same `GameConnection` interface** the
  online table uses, so the premium `TableScreen` runs unchanged — just driven
  locally instead of over a socket.
- Online (socket) mode and the backend are **untouched**.

## How to play (in the app)
1. Open the app → after the splash, you reach the **lobby**.
2. Tap the **"JOGAR SOLO — Texas Hold'em vs Bots"** card at the top.
3. On the setup screen, choose:
   - **Número de bots** — 1 to 5 AI opponents.
   - **Dificuldade** — Fácil / Médio / Difícil.
4. Tap **Iniciar partida** → the table opens and a hand starts immediately.
5. Play your turns: **Mesa** (check) · **Pagar** (call) · **Aumentar** (raise) ·
   **Desistir** (fold). The bots act automatically; play to showdown and see the
   result + your chip change.

No internet, no backend, no waiting for real players.

## Configuration (in code, if you want different defaults)
`LocalGameConnection(botCount: N, difficulty: BotDifficulty.medium, buyIn: 100,
smallBlind: 1, bigBlind: 2)` — set when launched from `SoloSetupScreen`.

## Build / install / test
```bash
# from repo root
source ~/.capa_flutter_env.sh
cd mobile
flutter test                 # 16 tests incl. the engine port (all green)
flutter build apk --debug    # installable APK (Solo needs no --dart-define)
# install on a device/emulator:
flutter install --debug
```
The debug APK installs directly. Solo Mode needs **no** `API_BASE` / backend.

## Bots — rules & behaviour
- Bots follow standard Texas Hold'em rules via the shared engine (legal actions
  only; the connection validates and falls back to a safe action so a hand never
  stalls).
- **Easy:** loose/passive (calls a lot, rarely raises).
- **Medium:** plays by hand strength.
- **Hard:** tighter and more aggressive (raises strong hands, folds weak ones).

## Notes / limits
- One hand per match for now (re-enter Solo setup to play again).
- Solo Mode is **for-fun chips only** — it does not touch the real-money wallet
  or the ledger (those are the online/backend path).
- "Teams" don't apply to poker (it's individual); the team-assignment option in
  the generic request is N/A here.
