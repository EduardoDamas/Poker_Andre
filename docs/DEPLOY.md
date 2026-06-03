# Deploying the CAPA CONTEST backend

The backend is a single Docker image ([backend/Dockerfile](../backend/Dockerfile)).
It needs **PostgreSQL** and **Redis**, and these env vars:

| Var | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `REDIS_URL` | Redis connection string |
| `JWT_SECRET` | long random string (sign/verify tokens) |
| `JWT_EXPIRES_IN` | e.g. `7d` |
| `PORT` | provided by the platform; the app binds `0.0.0.0:$PORT` |
| `OTP_PROVIDER` | `dev` (logs codes) → `twilio`/`zenvia` in production |

On startup the container runs `prisma migrate deploy` (applies pending
migrations) then launches the server. Health check: `GET /health`.

## Option A — Render (blueprint included)
1. Push this repo to GitHub.
2. Render → **New → Blueprint** → select the repo. It reads [render.yaml](../render.yaml):
   web service (Docker) + managed Postgres + Redis, with env vars wired
   automatically (`JWT_SECRET` auto-generated).
3. Deploy. The API comes up at `https://capa-contest-api.onrender.com`.
> Free tiers sleep/expire — upgrade Postgres + the web service before real use.

## Option B — Railway
1. Railway → **New Project → Deploy from GitHub repo**; set root to `backend`
   (it builds the Dockerfile).
2. Add **PostgreSQL** and **Redis** plugins.
3. In the service **Variables**, set `DATABASE_URL` and `REDIS_URL` to reference
   the plugins, plus `JWT_SECRET`, `JWT_EXPIRES_IN=7d`. Railway sets `PORT`.
4. Deploy; health check `GET /health`.

## Option C — Any Docker host (VPS)
```bash
docker build -t capa-api ./backend
docker run -d -p 3000:3000 \
  -e DATABASE_URL=postgresql://... \
  -e REDIS_URL=redis://... \
  -e JWT_SECRET=$(openssl rand -hex 32) \
  -e JWT_EXPIRES_IN=7d \
  capa-api
```

## Point the app at the deployed API
```bash
cd mobile
flutter build apk --release --dart-define=API_BASE=https://your-api-host
```
(Release APKs need a signing key — the marketing agency / Play Console handles
store signing; debug APKs install directly for testing.)

## Production checklist (before real money)
- [ ] Legal/compliance for cash-prize gaming (client responsibility) — the gate.
- [ ] Real SMS OTP provider (Twilio/Zenvia) + credentials.
- [ ] Restrict CORS / socket origins to the app.
- [ ] Sentry DSN for error tracking; a global HTTP throttler.
- [ ] Move `prisma migrate deploy` to a release step if running >1 instance.
- [ ] Redis adapter for Socket.IO across multiple instances.
- [ ] Backups on Postgres; rotate `JWT_SECRET` handling.
