# CAPA CONTEST — Premium UI/UX Redesign Proposal

> A world-class, casino-quality redesign of the Phase 1 Poker app, built on the
> real **Concept 4** brand (the caped top-hat mascot, crimson + obsidian). Goal:
> App-Store-featured polish, one-handed mobile UX, and a luxury atmosphere that
> reads "premium real-money platform," not "generic casino."
>
> Machine-readable tokens: [design/tokens.json](../design/tokens.json).

---

## 1. Design rationale

**The problem with the current build (before):** flat `#0D0D0D` background, one solid
red button, plain text lists, a basic green felt with flat cards. It's functional and
correctly themed, but it reads *prototype*, not *premium*. No depth, no material, no
motion, no hierarchy beyond size, no signature moments.

**Design principles (after):**
1. **Obsidian + Crimson + Gold.** Keep the brand's red/black, but deepen the blacks to
   a layered obsidian and introduce **gold** as the luxury/winnings/VIP accent. Red =
   action & brand. Gold = money, status, reward. This three-tone system is what
   separates "premium" from "loud casino."
2. **Material depth, not flatness.** Every surface sits on an elevation layer with soft
   shadows, hairline borders, and selective glass/blur for overlays. Light comes from
   above-left consistently.
3. **One-handed first.** Primary actions live in the bottom third (thumb zone). Sheets
   over full-screen modals. A floating center "Play" action anchors navigation.
4. **Signature moments.** Card deals, chips sliding to the pot, gold winner glow,
   balance roll-ups, daily-reward chest — a few crafted animations carry the premium feel.
5. **The mascot is the hero.** The caped top-hat "C" monogram becomes the app icon,
   splash, table watermark, empty-states, and reward art — a consistent character.
6. **Restraint.** Generous spacing, one accent per view, no gradients-on-gradients.
   Luxury is what you *leave out*.

---

## 2. Design system

### 2.1 Color palette
| Role | Token | Hex | Use |
|---|---|---|---|
| Obsidian 900 | `obsidian.900` | `#0A0A0B` | App background (base) |
| Obsidian 700 | `obsidian.700` | `#141417` | Cards / surfaces |
| Obsidian 600 | `obsidian.600` | `#1C1C21` | Raised surfaces, inputs |
| Border | `obsidian.border` | `#2A2B31` | Hairline 1px dividers/borders |
| **Crimson** | `crimson.base` | `#E2231A` | Primary brand & CTAs |
| Crimson glow | `crimson.glow` | `#FF4438` | Gradient top, hover, glow |
| Crimson deep | `crimson.deep` | `#B3140C` | Gradient bottom, pressed |
| **Gold** | `gold.base` | `#F5C45E` | Winnings, VIP, premium CTAs |
| Champagne | `gold.champagne` | `#FBE4A8` | Gold gradient top, highlights |
| Gold deep | `gold.deep` | `#C9982E` | Gold gradient bottom, trim |
| Felt | `felt.base`→`felt.deep` | `#1B5E3F`→`#0E3A26` | Poker table (radial vignette) |
| Felt rail | `felt.rail` | `#14151A` | Table rail (black leather) |
| Text primary | `text.primary` | `#F5F6F7` | Headings, key values |
| Text secondary | `text.secondary` | `#A7ABB4` | Supporting copy |
| Text tertiary | `text.tertiary` | `#6C7079` | Hints, disabled |
| Success | `semantic.success` | `#2FBF71` | Wins, online, deposits |
| Danger | `semantic.danger` | `#FF4438` | Fold, losses, errors |

**Signature gradients:** Crimson `135° #FF4438→#B3140C`, Gold `135° #FBE4A8→#C9982E`,
Obsidian `180° #1C1C21→#0A0A0B`, Felt `radial #1B5E3F→#0E3A26`.

### 2.2 Typography
- **Display/Brand:** `Sora` ExtraBold (or keep the logo lockup as art). Big numbers/titles.
- **Headings:** `Montserrat` 700/800.
- **Body/UI:** `Inter` 400/500/600.
- **Money & chips:** `Space Grotesk` with **tabular figures** (`tnum`) so digits don't jitter on roll-up.

| Style | Size/Line | Weight | Notes |
|---|---|---|---|
| Display | 34/40 | 800 | track −0.5; hero balances, win amounts |
| H1 | 28/34 | 800 | screen titles |
| H2 | 22/28 | 700 | section headers |
| H3 | 18/24 | 700 | card titles |
| Body | 15/22 | 400 | paragraphs |
| Label | 14/18 | 600 | buttons, tabs |
| Caption | 13/18 | 500 | metadata |
| Micro | 11/14 | 600 | track +0.4, uppercase tags |
| Money | 18/22 | 700 | tabular figures |

### 2.3 Spacing & grid
4-pt base: `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40`. **Screen padding 20dp.** Cards gap 12.
Section gap 24–32. Min tap target **44×44dp**.

### 2.4 Radii & elevation
Radii: input/sm `8`, md `12`, **card `20`**, bottom-sheet `28`, pill/chip `999`.
Shadows (layered, light from top): card `0 8 24 / 45%`, raised `0 12 32 / 55%`,
crimson glow `0 0 24 rgba(226,35,26,.45)`, gold glow `0 0 24 rgba(245,196,94,.35)`.
**Glass** (overlays): fill white 6%, 1px white-10% border, backdrop blur 24.

### 2.5 Iconography
24dp line icons, **2px stroke, rounded caps**; filled variants for active nav. Custom
glyph set: the four suits, a chip stack, the cape-hat mascot, a trophy, a gold coin,
a Pix mark. Keep stroke weight consistent with `Inter`.

### 2.6 Components
- **Buttons**
  - *Primary (Crimson):* 56dp tall, radius 16, crimson gradient, label `Inter 600 16`,
    press → scale 0.97 + soft crimson glow, 120ms.
  - *Premium (Gold):* same geometry, gold gradient, dark text `#1A1206` — used for
    Buy Chips, VIP, Claim Reward.
  - *Secondary:* glass fill + 1px white-10% border, white label.
  - *Tertiary:* text-only, crimson label.
  - *Icon button:* 44dp hit area, 24dp glyph.
- **Cards:** obsidian.700, radius 20, 1px border, card shadow. *Premium card* adds a
  1px gold gradient border + subtle top sheen.
- **Chips:** circular, denomination color-coded (white 1, red 5, blue 25, green 100,
  black 500, gold 1k), thin dashed inner ring, stack with 2px vertical offset + shadow.
- **Badges:** VIP tiers (Bronze/Silver/Gold/Platinum/Diamond) as gem-cut pills; rank
  badges (#1 gold, #2 silver, #3 bronze); status dots (online success / playing crimson).
- **Inputs:** obsidian.600 fill, radius 12, 1px border → crimson 2px on focus, floating
  label, 56dp tall.
- **Modals:** prefer **bottom sheets** (radius 28 top, grabber handle, glass backdrop
  blur). Centered dialog only for destructive confirms.
- **Navigation:** 5-slot bottom bar — *Lobby · Tournaments · ▢Play(center FAB)· Wallet ·
  Profile*. Center FAB is a raised crimson disc with the mascot; active tab = filled
  icon + crimson label + 2dp top indicator. Top bar: balance pill (gold coin + tabular
  amount) left, avatar + notifications right.

### 2.7 Motion
Durations: fast 120 · base 200 · slow 320 · deal 280 · celebrate 900ms.
Curves: standard `cubic-bezier(.2,0,0,1)`, emphasized `(.3,0,0,1)`, spring for chips/cards.
Signature animations: **card deal** (arc from dealer, 280ms stagger 40ms), **chips→pot**
(spring slide + shadow), **winner** (gold pot glow + pulse + tasteful gold confetti),
**balance roll-up** (count animation, 600ms), **shimmer** skeletons, **hero** lobby→table,
**haptic** light-impact on every action. Respect "reduce motion."

---

## 3. Imagery & asset sourcing

The app currently ships **zero images**. Add these, sourced from free platforms (check
license; Unsplash/Pexels/Pixabay are free for commercial use, attribution-appreciated):

| Where | Asset | Search query | Source |
|---|---|---|---|
| Splash / lobby hero | Dark dramatic poker table, chips, bokeh | "poker chips dark", "casino table low key" | Unsplash, Pexels |
| Table felt texture | Subtle green/black fabric or carbon | "green felt texture", "dark fabric texture" | Pixabay |
| Tournament banners | Trophy, spotlight, gold confetti | "trophy gold dark", "celebration confetti gold" | Pexels |
| VIP area | Luxury gold/black, marble, velvet | "luxury gold black", "black marble texture" | Unsplash |
| Wallet / Pix | Brazilian cash, abstract finance | "money brazil", "fintech abstract dark" | Pexels |
| Avatars (default set) | Stylized silhouettes | use generated/initials, or "avatar illustration" | Freepik free |
| Daily reward | Treasure chest, coins | "treasure chest", "gold coins pile" | Pixabay |
| Card faces/back | **Design custom** (cape-hat back) | n/a — vector in-house | — |

**Brand art (must come from the designer, not stock):** the Concept-4 mascot
(cartola+capa), app icon 1024², logo lockups — already in [docs/BRAND.md](BRAND.md).
Put delivered files in `assets/brand/` and `mobile/assets/`.

> Implementation note: bundle textures at @1x/@2x/@3x, compress (WebP/AVIF), lazy-load
> hero imagery, and always have a brand-colored fallback so the UI never shows a broken
> image. Avoid stocky "smiling casino" photos — keep it dark, abstract, premium.

---

## 4. Screens (before → after)

Legend for wireframes: `▓`=image/art, `■`=card, `●`=avatar/chip, `⬢`=FAB.

### 4.1 Game Lobby
**Goal:** make choosing a room feel aspirational and instant.
**Before:** plain vertical list of "Poker — Nível N / Entrada Rxx / 0/8".
**After:** hero header (balance + your tier), horizontal "Featured/Quick Play" carousel,
then room cards with live fill, stakes, and prize pool.

```
┌─────────────────────────────────────────────┐
│  ●Eduardo  Diamond            🪙 1.000,00  🔔 │  top bar: avatar+tier · gold balance pill
├─────────────────────────────────────────────┤
│  ▓▓▓ FEATURED — Torneio das 20h ▓▓▓  [Jogar] │  hero card, image bg + gold CTA
│  Prêmio R$ 12.400 · 312/800 · começa 14:32   │
├─────────────────────────────────────────────┤
│  Quick Play  ⟨ ● 8-max  ● Turbo  ● Heads-up ⟩│  horizontal chips/carousel
│                                               │
│  Mesas                                        │  H2
│  ■ Nível 1  R$20   ●●●○○○○○ 3/8   pot R$240   │  room card: fill dots, stake, live pot
│  ■ Nível 4  R$200  ●●●●●●○○ 6/8   pot R$2.4k  │
│  ■ Nível 7  R$10k  ●●●●●●●● CHEIA  [fila]     │  full → join-queue state
├─────────────────────────────────────────────┤
│  Lobby   Torneios   ⬢Jogar   Carteira  Perfil│  bottom nav + center FAB
└─────────────────────────────────────────────┘
```
**Spec:** screen pad 20; room card obsidian.700 r20, 16 inner pad, 12 gap; fill = 8 dots
(filled crimson, empty obsidian.500); stake `Money` style; CTA gold for featured, crimson
secondary for rooms. **Interaction:** card press → hero transition into the table; live
fill dots animate; pull-to-refresh shimmer.

### 4.2 Poker Table
**Goal:** immersive, readable at a glance, controls in the thumb zone.
**Before:** flat green box, "Mesa"/"Suas cartas" labels, plain cards, buttons in a Wrap.
**After:** radial-vignette felt with black-leather rail + gold trim, seats around an oval,
dealer button + blinds, animated pot in center, your cards enlarged at the bottom, and a
**floating action dock** (Fold / Check-Call / Bet-Raise) with a slide-to-raise amount.

```
┌─────────────────────────────────────────────┐
│ ‹ Nível 4 · R$200        Pot ▒ R$ 2.480  ⚙  │  minimal top: back · pot · settings
│            ●P3 ▢▢      ●P4 ▢▢                │  opponents: avatar, mini cards face-down
│      ●P2 ▢▢                    ●P5 ▢▢        │  active seat = crimson ring + timer arc
│            ╭───────────────────╮            │
│   ●P1 ▢▢   │   ▓ felt vignette  │  ●P6 ▢▢    │
│            │  🂡 🂮 🂭  ⊙pot      │            │  board cards + chips pile in pot
│            ╰───────────────────╯            │
│                  DEALER ⓑ                    │
│                ┌───────────┐                 │
│   Sua vez  ⏱   │  🂱   🂾   │   R$ 980        │  YOUR hole cards (large) + your stack
│                └───────────┘                 │
│  ┌────────┐ ┌──────────┐ ┌───────────────┐  │
│  │ Desist.│ │  Pagar 40│ │  Aumentar  ▸ │  │  action dock (thumb zone)
│  └────────┘ └──────────┘ └───────────────┘  │
│        �────────●──────── R$ 120  [min|½|pot]│  raise slider + quick-amount chips
└─────────────────────────────────────────────┘
```
**Spec:** felt radial `#1B5E3F→#0E3A26`, rail `#14151A` 14dp with 1px gold trim; your
cards 64×90 (others 28×40); active seat crimson ring + 12s **timer arc** (turns amber <4s);
action dock pinned bottom, 56dp buttons — Fold danger-outline, Call crimson, Raise gold;
pot uses `Money` + chip pile art. **Interaction:** **deal** = cards arc from dealer 280ms
stagger; **call/raise** = chips spring to pot + light haptic; **win** = winner seat gold
glow + pot slides to winner + balance roll-up + brief gold confetti; reconnect = skeleton
seats fade in (already supported by the backend's `table:rejoin`).

### 4.3 Tournament
**Goal:** convey scale, urgency, and your standing.
**After:** banner (image + countdown), prize-pool ladder, your position/stack, blind-level
timer, and a live players-remaining bar mapped to the eliminatory phases
(`800→100→16→2`, from [PRIZE_RULES.md](PRIZE_RULES.md)).

```
┌─────────────────────────────────────────────┐
│ ▓▓ Torneio das 20h ▓▓        começa 14:32 ⏳ │  hero image + countdown
│ Buy-in R$200 · Prêmio R$ 12.400              │  gold prize emphasis
├─────────────────────────────────────────────┤
│ Você: 14º / 312        Stack 18.200          │  your standing
│ Restantes ▰▰▰▰▰▱▱▱  312→ Fase 2 (100)        │  phase bar (per-game lookup, not ÷N)
│ Blinds 100/200  ⏱ próximo nível em 4:12      │
├─────────────────────────────────────────────┤
│ Premiação                                    │
│ 🥇 1º  R$ 4.960   🥈 2º R$ 2.480  🥉 3º …    │  prize ladder, gold/silver/bronze badges
│ Estrutura: 25% F1 · 50% F2 · 75% F3 · 100%F4│  loser re-entry % (Poker) from the PDF
├─────────────────────────────────────────────┤
│            [  Entrar na mesa  ]              │  gold CTA
└─────────────────────────────────────────────┘
```
**Spec:** phase bar segments come straight from the per-game lookup (POKER 800/100/16/2 —
*never* a generic divide). Countdown in `Space Grotesk` tabular. **Interaction:** segment
fills animate as players bust; "in the money" bubble bursts gold when reached.

### 4.4 Player Profile
**After:** crest-style header (avatar ring colored by VIP tier, name, handle, tier badge),
stat cards (hands, win-rate, biggest pot, ROI), achievements grid, and recent results.

```
┌─────────────────────────────────────────────┐
│        ●  (gold ring = Diamond)              │
│        Eduardo  ·  @eduardo  ·  ◆ Diamond    │
│        Membro desde Jun/2026                 │
├─────────────────────────────────────────────┤
│ ■ Mãos 1.204  ■ Vitórias 38%  ■ Maior R$3.2k │  stat cards (3-up)
├─────────────────────────────────────────────┤
│ Conquistas  🏆 🎖 ♠ 🔥  …                    │  badges grid (earned=gold, locked=grey)
│ Histórico   ▸ Nível 4  +R$ 240  agora        │
│             ▸ Torneio  −R$ 200  ontem        │
└─────────────────────────────────────────────┘
```
**Spec:** avatar ring color = VIP tier; stat cards obsidian.700 r20; win amounts success,
losses danger. CPF/phone shown masked, never full (privacy). **Interaction:** badge tap →
detail sheet; pull-down parallax on header art.

### 4.5 Wallet / Balance
**Goal:** trust + clarity for real money (Phase 1 = manual Pix).
**After:** big balance with roll-up, primary **Depositar (Pix)** + **Sacar (Pix)** buttons,
reserved-funds note for pending withdrawals, and a clean transaction ledger with icons.

```
┌─────────────────────────────────────────────┐
│              Saldo                            │
│         🪙  R$ 1.000,00                        │  display size, gold coin, roll-up
│   disponível 800,00 · reservado 200,00       │  shows withdrawal reservation
│  ┌───────────────┐  ┌───────────────┐        │
│  │ ⬇ Depositar   │  │ ⬆ Sacar (Pix) │        │  gold primary · crimson secondary
│  └───────────────┘  └───────────────┘        │
├─────────────────────────────────────────────┤
│ Transações                                   │
│ ⬆ Saque  −R$200  Pix · pendente   há 2 min   │  status pill: pendente/pago/recusado
│ 🏆 Prêmio +R$240  Mesa Nível 4    ontem      │
│ ⬇ Depósito +R$1.000  Pix          3 dias     │
└─────────────────────────────────────────────┘
```
**Spec:** amounts `Money` tabular; deposit gold, withdraw crimson; status pills
(pendente=warning, pago=success, recusado=danger). Mirrors the double-entry ledger
(available vs reserved). **Interaction:** **Sacar** opens a bottom sheet (amount + Pix key
+ review); success → confetti-lite + roll-down; pending withdrawals show a subtle pulse.

### 4.6 Leaderboards
**After:** segmented tabs (Diário/Semanal/Geral), a **podium** top-3 with mascot-framed
avatars, then a ranked list; sticky "your rank" row at the bottom.

```
┌─────────────────────────────────────────────┐
│  ⟨ Diário | Semanal | Geral ⟩                │  segmented control
│             🥈        🥇        🥉            │  podium (1 center, raised, gold glow)
│            ●P2       ●P1       ●P3            │
│         R$ 3.1k   R$ 5.4k   R$ 2.8k          │
│ ───────────────────────────────────────────  │
│  4  ● Lucas      R$ 2.1k                      │  ranked rows
│  5  ● Marina     R$ 1.9k                      │
│ ───────────────────────────────────────────  │
│  37 ● Você       R$ 480           (sticky)    │  pinned current-user row
└─────────────────────────────────────────────┘
```
**Spec:** podium #1 raised + gold glow + crown; rows obsidian.700; rank badges gold/silver/
bronze for top-3. **Interaction:** tab switch = horizontal slide; your row pulses on entry.

### 4.7 Daily Rewards
**After:** a 7-day streak rail with a hero **chest** for today; claimed days gold-checked,
future days dimmed; a "claim" celebration.

```
┌─────────────────────────────────────────────┐
│            ▓ Recompensa Diária ▓             │
│                 [ 🎁 Dia 3 ]                  │  hero chest, gold glow, bounce idle
│  ✓D1  ✓D2  ◉D3  D4  D5  D6  D7(★)            │  streak rail: claimed/today/locked
│            [  Resgatar  ]                     │  gold CTA
│   Volte amanhã para manter a sequência        │
└─────────────────────────────────────────────┘
```
**Spec:** today = gold ring + scale pulse; claimed = gold check; locked = obsidian.600 40%.
Day 7 = star bonus. **Interaction:** claim → chest opens, coins burst, balance roll-up,
haptic; streak advances with a slide.

### 4.8 Settings
**After:** grouped list with section headers, inline toggles, clear destructive zone.

```
┌─────────────────────────────────────────────┐
│ Conta        ● Perfil · Verificação · CPF**  │
│ Jogo         Animações ▸  Som [on]  Háptico  │
│ Notificações Push [on]  Torneios [on]        │
│ Segurança    Auto-exclusão · Limites         │  responsible-gaming controls
│ Suporte      Ajuda · Termos · Privacidade    │
│ ──────────────                               │
│ Sair         (text)        ·  Excluir conta  │  destructive in its own zone
└─────────────────────────────────────────────┘
```
**Spec:** rows 56dp, section headers Micro uppercase tertiary, toggles crimson-on;
**responsible-gaming** (limits, self-exclusion) is a first-class section — important for a
real-money product. **Interaction:** toggles spring; destructive actions confirm via dialog.

### 4.9 VIP Membership
**After:** the luxury centerpiece — dark + gold, tier ladder with progress, perks per tier,
and an upgrade CTA. This is where gold earns its place.

```
┌─────────────────────────────────────────────┐
│ ▓▓ obsidian + gold marble ▓▓                 │
│        ◆ DIAMOND                              │  current tier crest, gold foil
│  Progresso ▰▰▰▰▰▰▰▱  8.200 / 10.000 XP        │  gold progress to next tier
│ ──────────────────────────────────────────   │
│  Benefícios                                   │
│  ✓ Rake reduzido   ✓ Saque prioritário        │  perk list, gold checks
│  ✓ Torneios VIP    ✓ Suporte dedicado         │
│  Bronze · Prata · Ouro · Platina · ◆Diamante │  tier ladder (current highlighted)
│            [  Ver benefícios  ]              │  gold CTA
└─────────────────────────────────────────────┘
```
**Spec:** the *only* screen where gold dominates; tier crests gem-cut; progress bar gold
gradient. **Interaction:** tier ladder horizontal scroll; reaching a tier = gold-foil
shimmer + crest mint animation.

---

## 5. Responsive & accessibility
- **Layouts:** single-column, 20dp gutters; content max-width 480dp (center on tablets/
  foldables); table screen uses `AspectRatio` + safe-area insets; landscape table option.
- **Density:** support small phones (360dp) → no clipping in the action dock (wrap raise
  slider above buttons if width < 360).
- **A11y:** AA contrast (obsidian/text passes; gold-on-dark passes for ≥18sp); 44dp targets;
  `Semantics` labels on cards; "reduce motion" disables confetti/parallax; color is never
  the *only* signal (icons + text on status).

---

## 6. Mapping to the current Flutter app (implementation plan)
The redesign drops cleanly onto the existing, tested code — no backend changes.

| Redesign piece | Lands in |
|---|---|
| Tokens v2 → `Brand`/theme | `mobile/lib/theme.dart` (extend with gradients, gold, type scale) |
| Lobby cards | `mobile/lib/screens/lobby_screen.dart` (consumes `GET /tables` already) |
| Table felt + action dock | `mobile/lib/screens/table_screen.dart` (consumes `GameSnapshot`) |
| Card faces/back | `mobile/lib/widgets/playing_card.dart` |
| Bottom nav + center FAB | new `mobile/lib/widgets/app_scaffold.dart` |
| Wallet, Profile, Tournaments, Leaderboard, Rewards, Settings, VIP | new screens (some need new backend endpoints later) |

**Phasing the build (test-gated, like the rest):**
1. **Theme v2** — gradients, gold, typography, buttons, cards (widget tests for theme).
2. **Lobby redesign** — hero + room cards (uses existing data).
3. **Table redesign** — felt, seats, action dock, deal/chips/win animations (biggest win).
4. **Wallet + Profile** (Wallet needs a player-facing balance endpoint + withdraw screen).
5. **Tournaments / Leaderboards / Rewards / VIP** — these need new backend modules
   (tournament engine, leaderboard, rewards) that are currently deferred — build the
   backend first, then the screen.

**Honest scope note:** screens 1–4 are buildable now against the existing backend.
Screens 5–9 are *designs ready*, but their data (tournaments, leaderboards, daily rewards,
VIP) requires backend modules we deferred (see [PRIZE_RULES.md](PRIZE_RULES.md) + plan) —
so I'd ship those UIs alongside their endpoints, not as static mockups.

---

## 7. Deliverables checklist
- [x] Design rationale & principles
- [x] Full design system (color, type, spacing, radii, elevation, glass, icons, components, motion) — tokens in [design/tokens.json](../design/tokens.json)
- [x] Screen-by-screen (9 screens) with before→after, wireframes, specs, interactions
- [x] Image sourcing guidance (Unsplash/Pexels/Pixabay/Freepik queries)
- [x] Responsive & accessibility
- [x] Implementation mapping to the Flutter codebase + phased plan
- [ ] *Next:* implement Theme v2 + Lobby + Table in Flutter (gated, on request)
