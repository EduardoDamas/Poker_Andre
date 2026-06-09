# CAPA CONTEST — Prize, Tournament & Pricing Rules (from CAPACONTEST.pdf)

> Source of truth for the money/tournament numbers. Values confirmed by the client
> from CAPACONTEST.pdf. Money in code is integer cents; values below are in BRL
> unless noted. Keep this file in sync with the implementing modules.

## 1. Prize multiplier by room occupancy (% of tables occupied)

Prize = **multiplier × V.I.** (Valor Investido / entry fee). Implemented in
[backend/src/poker/prize-table.ts](../backend/src/poker/prize-table.ts).

| % tables occupied | Multiplier |
|---|---|
| 100% | 200 × V.I. |
| 90–99% | 180 × V.I. |
| 80–89% | 160 × V.I. |
| 70–79% | 140 × V.I. |
| 60–69% | 120 × V.I. |
| 50–59% | 100 × V.I. |
| 40–49% | 80 × V.I. |
| 30–39% | 60 × V.I. |
| 20–29% | 40 × V.I. |
| 10–19% | 20 × V.I. |
| < 10% | **no prize defined** → multiplier 0, `prizeAwarded:false` (flagged edge case) |

Rule: **max 800 participants/room**; with fewer, prizes pay per this table.
Money-safety: prize is capped at the amount collected (never overpay).

## 2. Room capacity by game

| Game | Players/table | Tables | Max participants |
|---|---|---|---|
| **Poker** (Phase 1) | 8 | 100 | **800** |
| Dominó | 4 | 200 | 800 |
| Buraco | 4 | 200 | 800 |
| Canastra | 4 | 200 | 800 |
| Xadrez | 2 | 400 | 800 |

## 3. Eliminatory phases — players remaining per phase

> ⚠️ INVARIANT for the eliminatory engine: progression is **NOT a clean ÷N**
> (Poker goes 800 → 100 → 16 → 2). Use this per-game lookup, never a generic rule.

| Game | F1 | F2 | F3 | F4 | F5 | F6 | F7 | F8 | F9 | F10 |
|---|---|---|---|---|---|---|---|---|---|---|
| **POKER** | 800 | 100 | 16 | 2 | – | – | – | – | – | – |
| DOMINÓ | 800 | 100 | 24 | 6 | 2 | – | – | – | – | – |
| BURACO | 800 | 400 | 200 | 100 | 50 | 24 | 12 | 8 | 4 | 2 |
| CANASTRA | 800 | 400 | 200 | 100 | 50 | 24 | 12 | 8 | 4 | 2 |
| XADREZ | 800 | 400 | 200 | 100 | 50 | 24 | 12 | 8 | 4 | 2 |

## 4. Loser continues — % of entry fee to re-enter the next phase

| Game | F1 | F2 | F3 | F4 | F5 | F6 | F7 | F8 | F9 | F10 |
|---|---|---|---|---|---|---|---|---|---|---|
| **POKER** | 25% | 50% | 75% | 100% | – | – | – | – | – | – |
| DOMINÓ | 25% | 30% | 50% | 60% | 80% | 100% | – | – | – | – |
| BURACO / CANASTRA / XADREZ | 10% | 20% | 30% | 40% | 50% | 60% | 70% | 80% | 90% | 100% |

## 5. Entry fee (V.I.) by room level × subscription type — Poker uses this table

Values in BRL. Higher subscription tiers get cheaper entry.

| Level | Não assinante | Mensal | Trimestral | Semestral | Anual |
|---|---|---|---|---|---|
| Nível 1 | 20 | 17 | 15 | 12 | 10 |
| Nível 2 | 40 | 34 | 30 | 24 | 20 |
| Nível 3 | 100 | 85 | 75 | 55 | 50 |
| Nível 4 | 200 | 170 | 150 | 120 | 100 |
| Nível 5 | 1000 | 850 | 750 | 600 | 500 |
| Nível 6 | 2000 | 1700 | 1500 | 1200 | 1000 |
| Nível 7 | 10000 | 8500 | 7500 | 6000 | 5000 |

## 6. Prize-share % by subscription type

Fraction of the total prize pool a player is entitled to:

| Subscription | Share |
|---|---|
| Não assinante | 25% |
| Mensal | 30% |
| Trimestral | 50% |
| Semestral | 75% |
| Anual | 100% |

## 7. Quick matches (Partidas rápidas)

Prize = **entry fee + 50%**.

## 8. Still to obtain (in the PDF, request when building those modules)

- Subscription **prices** (Mensal/Trimestral/Semestral/Anual) for Card + Pix.
  → BLOCKS the paid subscription-purchase flow. Tiers can already be granted
  manually by an admin (POST /admin/users/:id/subscription).
- "Rodada da Sorte" prize details.
- Loser-streak prize keys.
- Referral logic (20% credit + trackable codes + reports).

## 9. Implementation status (Phase 1)

| Area | Status |
|---|---|
| Prize multiplier by occupancy (§1) | ✅ `poker/prize-table.ts` + tested |
| Entry fee by level × subscription (§5) | ✅ `tournament/subscription.ts` + tested |
| Prize-share % by subscription (§6) | ✅ `tournament/subscription.ts` + tested |
| Tournament entry escrow + prize payout | ✅ `tournament/tournament.service.ts` + tested (double-entry conserved) |
| Manual Pix deposit (player + admin confirm) | ✅ `wallet/deposit.service.ts` + admin UI |
| Manual Pix withdrawal | ✅ existing `wallet/withdrawal.service.ts` + admin UI |
| Subscription tier (grant by admin) | ✅ `User.subscription` + admin UI dropdown |
| **Live tournament play** (entry on join → elimination → prize) | ⏳ money flow ready; realtime wiring pending product decision |
| Eliminatory phases (§3, 800→100→16→2) | ⏳ multi-table model — Phase 2 |
| Subscription **purchase** (paid) | 🚫 blocked on prices (§8) |
| Automated Pix gateway | 🚫 blocked on client merchant account + licence |

> Phase-1 occupancy basis: one 8-seat table IS the room (full table = 100% =
> 200×V.I.), matching the mobile solo prize display. The full 800-player /
> 100-table model with eliminatory phases is Phase 2.
