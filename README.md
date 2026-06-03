# CAPA CONTEST — Phase 1 (Poker)

Real-money multiplayer Texas Hold'em platform. **Phase 1 = Poker only**, manual Pix
withdrawals processed by the admin. See [docs/](docs/) for scope and architecture.

> ⚠️ **This is a real-money application.** Two rules are non-negotiable:
> 1. The **server is authoritative** — shuffling, RNG (`crypto.randomBytes`, never
>    `Math.random`), and hand evaluation happen only on the backend.
> 2. The wallet is a **double-entry ledger** in Postgres. Every credit movement is an
>    immutable, balanced transaction. Money is never mutated in place.

## Repository layout

```
.
├── backend/          NestJS + TypeScript — authoritative game server & API
│   ├── prisma/       Database schema (Postgres) — wallet ledger, users, tables
│   └── src/          Modules: auth, wallet, poker engine, realtime gateway, admin
├── admin/            React-Admin web panel (players, withdrawals, tables)  [later]
├── mobile/           Flutter app — Texas Hold'em client                    [later]
├── docs/             Scope, architecture, compliance notes
└── docker-compose.yml  Local Postgres + Redis
```

## Tech stack

| Layer        | Choice                                              |
|--------------|-----------------------------------------------------|
| Mobile       | Flutter (Android first)                             |
| Backend      | Node.js + TypeScript + NestJS                       |
| Realtime     | Socket.IO (Redis adapter for scale)                 |
| Database     | PostgreSQL (money/ACID) + Prisma ORM                |
| Live state   | Redis                                               |
| Auth         | Phone OTP + Facebook; CPF validation, 18+ block     |
| Payments     | Phase 1: manual wallet + admin payout. Phase 2: Pix |
| Admin panel  | React-Admin (web)                                   |

## Getting started (backend)

Prerequisites: Node 20+, Docker.

```bash
# 1. Start Postgres + Redis
docker compose up -d

# 2. Backend
cd backend
cp .env.example .env
npm install
npx prisma migrate dev --name init   # create database schema
npm run start:dev                     # http://localhost:3000
```

## Scope boundary (Phase 1)

Included: poker engine, real-time multiplayer, internal credit wallet, phone/Facebook
auth + CPF/18+ check, admin panel, manual Pix withdrawal marking, prize table.

**Excluded (Phase 2):** automatic Pix deposit/withdrawal, the other 4 games (Dominó,
Buraco, Canastra, Xadrez), referral system. See [docs/SCOPE.md](docs/SCOPE.md).
