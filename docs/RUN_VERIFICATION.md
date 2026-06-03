# Verify the Phase 1 slice end-to-end

Goal: see a real hand play from a phone (or with a bot opponent) against the
backend. The full live path is already proven server-side by `npm run bot`
(two bots play a hand to showdown and settle) — this guide adds a real device.

## 0. Prerequisites
- Docker running; Flutter env: `source ~/.capa_flutter_env.sh`
- Find your machine's LAN IP (the phone must reach it):
  ```bash
  hostname -I | awk '{print $1}'      # e.g. 192.168.0.10
  ```

## 1. Start the backend
```bash
cd backend
docker compose up -d            # Postgres + Redis   (from repo root: docker compose up -d)
npm run build
node dist/main.js               # http://localhost:3000  (or: npm run start:dev)
curl localhost:3000/health      # {"status":"ok",...}
```

## 2. Register + fund your player
Open the app (step 3) and register with your phone once, OR pre-create by
registering through the API. Then fund the wallet (no public deposit endpoint
in Phase 1):
```bash
cd backend
npm run fund -- +55YOURNUMBER 100000     # R$1000,00 in cents
```

## 3. Build & install the app, pointed at your machine
```bash
cd mobile
flutter build apk --debug --dart-define=API_BASE=http://<LAN_IP>:3000
# install on a connected device:
flutter install --debug --dart-define=API_BASE=http://<LAN_IP>:3000
# (debug APK is directly installable; release APK needs signing — agency/Play Store)
```
On the phone: enter your phone number → the OTP code is printed in the backend
log (dev provider): look for `[DEV] OTP for +55...: 123456`. Enter it → lobby.

## 4. Play a hand
Two ways:

**A. With one phone + a bot (easiest):**
```bash
cd backend
npm run bot -- poker-l1 1        # bot sits and waits
```
Then on the phone, tap **Poker — Nível 1**. The hand starts when you sit
(2 players). Play to showdown; the bot checks/calls. Result + payout shown.

**B. With two phones:** install on both, both tap the same room → hand starts.

## Notes
- A hand auto-starts when 2 players are seated; one hand per sit-down for now
  (re-sit to play again — between-hands lobby is a deferred enhancement).
- OTP is rate-limited to 5/min per phone.
- The OTP code is logged, not sent by SMS (Phase 1 dev provider; Twilio/Zenvia
  in production).
- Money: buy-in is fixed at 100 chips for the realtime table in Phase 1; the
  per-level entry fees in the lobby come from CAPACONTEST.pdf (docs/PRIZE_RULES.md)
  and feed the tournament/prize logic (its own modules, deferred).
