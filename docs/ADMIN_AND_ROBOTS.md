# Admin user management + online robot matches

Two feature sets, both additive (online real-vs-real play and Solo Mode unchanged).

## A. Admin: reject applications, block/unblock users

### What changed
- **Schema:** `User.blockedUntil` (temp-block expiry; null = permanent) + `User.blockReason`
  (migration `add_block_fields`). Helper [`auth/user-status.ts`](../backend/src/auth/user-status.ts) `isBlocked()`.
- **Service** [`admin.service.ts`](../backend/src/admin/admin.service.ts): `rejectApplication`
  (PENDING only → deletes the user → **frees phone + CPF** for re-registration),
  `blockUser` (temp `untilMs` or permanent + reason), `unblockUser`; `listPlayers`
  now returns `blocked`, `blockedUntil`, `blockReason`.
- **Endpoints** [`admin.controller.ts`](../backend/src/admin/admin.controller.ts):
  `POST /admin/users/:id/reject`, `/block`, `/unblock` (all audit-logged).
- **Enforcement (no bypass):**
  - OTP login ([otp.service.ts](../backend/src/auth/otp/otp.service.ts)) denies blocked
    users and **auto-reactivates** an expired temporary block.
  - The socket gateway ([game.gateway.ts](../backend/src/realtime/game.gateway.ts)) rejects
    `table:join` and `hand:action` from blocked users — so they can't join rooms,
    start matches, or play even via direct API calls.
- **Admin UI** [`admin/src/components/Players.tsx`](../admin/src/components/Players.tsx):
  status badges (ATIVO / PENDENTE / BLOQUEADO + reason + expiry) and buttons —
  **Rejeitar aplicação** (pending), **Bloquear temp.**, **Bloquear perm.**, **Desbloquear**.

### How to test (admin)
1. Backend + admin panel running; log into the panel as an ADMIN (`/admin`, e.g. `+5511988887777`).
2. **Reject:** register a number in the app but DON'T verify (stays PENDING) → in the
   panel it shows **PENDENTE** with **Rejeitar aplicação** → click it → the row vanishes
   and that phone/CPF can register again.
3. **Block (perm):** on an ACTIVE player click **Bloquear perm.** + reason → badge turns
   **BLOQUEADO (perm.)** → that user can no longer log in or join a table (try in the app).
4. **Block (temp):** **Bloquear temp.** + reason + hours → badge shows the expiry; after it
   passes, the next login auto-unblocks.
5. **Unblock:** **Desbloquear** → back to ATIVO, can play again.

Automated: `npx jest user-status admin-users` (11 tests).

## B. Online robot matches (no deductions vs robots)

### What changed (all in [`realtime/`](../backend/src/realtime/))
- Seats gain `isRobot`. `TableService`: `fillWithRobots`, real-user **replaces a robot**
  on join, `hasRobots`, `realPlayerCount`, `robotToAct`, `robotDecision`
  ([bot-brain.ts](../backend/src/realtime/bot-brain.ts) — basic check/call/fold AI).
- **Money rule:** `settle()` runs **only when no robots are present**. Robot or mixed
  matches are **free play — no deductions, no balance changes** (#6, #7).
- **Gateway driver:** when a real player waits alone, the server fills the room with
  robots and starts the match; robots take their turns automatically (with a short
  delay) and the match plays to showdown. As real users join, robots are replaced.
- **Enabled by env flag** `ROBOTS_FILL=1` (off by default so existing online tests are
  untouched). Start the backend with it to enable online robot-fill:
  ```bash
  ROBOTS_FILL=1 node dist/main.js
  ```

### How to test (robots)
1. Start the backend with `ROBOTS_FILL=1`.
2. In the app, log in and tap an online room (**Salas (online)**) — **don't** start a bot
   process. After ~1.5s the server fills the room with robots and the hand begins; play
   your turns, robots respond, hand reaches showdown.
3. Your **wallet does not change** (robot match). Verify in the admin panel or `/auth/me`.
4. If a second real player joins the same room, they take a robot's seat.

Automated: `npx jest robots.spec` (3 tests: fill+play, no-deduction, robot replacement).

> Note: real-vs-real online matches still deduct buy-ins via the ledger exactly as
> before (covered by the existing play/settlement tests). Solo Mode (on-device) is a
> separate offline path and also deducts nothing.
