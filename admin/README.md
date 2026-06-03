# CAPA CONTEST — Admin panel

React + Vite + TypeScript web panel for the manual-Pix admin workflow. Consumes
the backend `/admin/*` API (role-guarded).

## Features
- Phone-OTP login (non-admin accounts are blocked by the API).
- **Saques** — pending withdrawals with **Pagar** (approve) / **Rejeitar** (reject).
- **Jogadores** — players with status, role, and wallet balance.

## Run
```bash
npm install
npm run dev        # http://localhost:5173
```
Point at a backend (default http://localhost:3000):
```bash
VITE_API_BASE=https://your-api-host npm run dev
```

## Test / build
```bash
npm test           # vitest (component tests, mocked API)
npm run build      # type-check + production bundle → dist/
```

## Make a user an admin
The first admin must be promoted directly in the DB (no self-service):
```sql
UPDATE "User" SET role = 'ADMIN' WHERE phone = '+55...';
```
Then log in with that phone via OTP (code is printed in the backend dev log).
