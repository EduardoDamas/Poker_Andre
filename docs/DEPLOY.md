# CAPA CONTEST — Deploy Runbook (test launch)

Goal: a public backend + hosted Postgres so the Play Store internal-testing build works
for real testers, and the privacy-policy URL resolves.

## 1. Backend + Postgres on Render (blueprint)
The repo ships `render.yaml` (web service + free Postgres + Redis).

1. Push the repo to GitHub (Render deploys from a Git remote).
2. Render → **New → Blueprint** → pick this repo → Render reads `render.yaml`.
3. It provisions: `capa-contest-api` (Docker, `/health` check), `capa-postgres`, `capa-redis`.
   `JWT_SECRET` is auto-generated; `DATABASE_URL`/`REDIS_URL` are wired automatically.
4. On boot the container runs `prisma migrate deploy` then starts the server.
5. **Confirm the real service URL** (Render dashboard). The blueprint name yields
   `https://capa-contest-api.onrender.com`, but if that host is taken you get a suffix.
   Whatever it is, that exact URL must match the app build (step 3 below) and the
   Play Console privacy URL.

Verify: open `https://<url>/health` → `{"status":"ok","db":"reachable"}` and
`https://<url>/legal/privacidade` → the privacy page.

## 2. OTP delivery (testers must receive login codes) — DECISION NEEDED
Current provider only **logs** the code (dev). Hosted testers can't see server logs.
Pick one before inviting testers:
- **Real SMS (recommended for launch):** Zenvia (BR) or Twilio. Needs an account + credentials;
  add a provider + set `OTP_PROVIDER`. Small per-SMS cost.
- **Closed-test code reveal (temporary):** expose the dev code to the tester in-app.
  Acceptable ONLY for the trusted internal track with no real money; must be removed
  before public / real-money launch.

## 3. App build pointing at the hosted backend
```
cd mobile
flutter build appbundle --release --dart-define=API_BASE=https://<real-render-url>
```
Output: `build/app/outputs/bundle/release/app-release.aab` — signed with the upload
keystore (`android/upload-keystore.jks`; see release-keystore memory). Upload this AAB.

## 4. Play Console (internal testing)
1. Create the app → **Testing → Internal testing** → upload the AAB.
2. App content: privacy policy = `https://<url>/legal/privacidade`; fill data-safety,
   ads, content rating; real-money-gaming declaration as required.
3. Add testers (emails / Google Group), copy the **tester link**, send to André.

## Keystore — back this up off-machine
`mobile/android/upload-keystore.jks` + `mobile/android/key.properties` are gitignored.
Losing them = the app can never be updated again. Store both somewhere safe.
