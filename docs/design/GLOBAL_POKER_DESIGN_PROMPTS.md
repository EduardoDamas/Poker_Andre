# MERIDIAN POKER — Complete Visual Asset Production Prompt Book

> **Status:** Master design-prompt document for a global, premium, **play-money** Texas Hold'em application.
> **Working brand name:** `MERIDIAN POKER` — a placeholder codename. Replace every occurrence with the final approved brand before production.
> **Scope discipline:** Play-money only. No real-money, crypto, cash withdrawal, sports betting, or misleading cash imagery anywhere in these assets.
> **Originality mandate:** All assets are original. Reference products (Gambit, WSOP Play, PokerStars Play Money, Replay Poker) inform *quality and function only* — never reproduce their logos, characters, layouts, card faces, chip art, or animations.

---

## 0. How to use this document

This book is designed so that **every asset prompt is "complete" without repeating 19 fields hundreds of times.** It works in three layers:

1. **Global defaults (§1–§3).** The design system, consistency rules, naming, and export settings. These are the *inherited* values for fields 8–19 (style, color, dimensions rules, formats, accessibility, consistency notes) unless an asset overrides them.
2. **Family master prompts (§4).** One master per asset family. A master fully specifies the shared image-generation prompt, negative prompt, style, palette, and export baseline for that family. Every individual asset in the family **inherits its master** and only states its deltas.
3. **Per-asset entries (§5–§16).** Hero/complex assets get the full 19-field treatment. High-count, near-identical assets (cards, icons, emotes, chip denominations) get a compact entry: **Asset ID + name + purpose + prompt delta + states/variants + dimensions + format**, all other fields inherited from the family master and global defaults.

**Reading an inherited field:** if a per-asset entry does not restate a field, use the family master's value; if the master is silent, use the global default in §1–§3. This is explicit, not vague — the value is always resolvable.

**Model/tool-agnostic prompting.** Prompts are written to work across diffusion tools (Midjourney, SDXL, Flux, Firefly, Ideogram for text-in-image) and vector/UI workflows. Where a family is best produced as **vector** (icons, logo, cards' pip layout), the prompt is written as an *art-direction brief for a vector designer or a vector-capable generator*, plus a raster reference-generation prompt. Where text must render correctly (logo wordmark, card indices, marketing copy), prefer a text-capable generator or set the type in a vector tool over a generated background — **never trust diffusion models to spell.**

---
## 1. Design system foundation (visual DNA)

**Positioning:** premium, contemporary, trustworthy, competitive, entertaining. Elegant dark interface with cinematic lighting used *selectively*. Refined 2D / 2.5D illustration. Mature, friendly characters. Restrained gold. No neon overload, no childish casino kitsch, no cash symbols.

### 1.1 Color tokens (authoritative — sRGB hex)

| Token | Hex | Role |
|---|---|---|
| `bg.deep` | `#0A0E1A` | Deepest background, splash, modals scrim |
| `bg.base` | `#10162A` | App background (navy) |
| `surface` | `#161D33` | Cards, panels, sheets |
| `surface.raised` | `#1E273F` | Elevated panels, dropdowns, active rows |
| `hairline` | `#2A3350` | 1px borders, dividers |
| `felt.deep` | `#123D2E` | Table felt core (emerald) |
| `felt.mid` | `#1B5741` | Table felt highlight ring |
| `emerald.accent` | `#2FBF87` | Primary CTA, success, positive money-in |
| `emerald.bright` | `#46E3A5` | Glow/hover highlight, active-player ring |
| `gold.core` | `#C9A227` | Premium accents (frames, trophies) — **use sparingly** |
| `gold.soft` | `#E4C56A` | Gold highlight/specular |
| `text.hi` | `#F4F6FB` | Primary text |
| `text.mid` | `#AEB6C8` | Secondary text |
| `text.low` | `#6C7590` | Tertiary/disabled text |
| `danger` | `#E5484D` | Fold action, errors, destructive |
| `warning` | `#E8A33D` | Warnings, low-timer |
| `info` | `#4C8DF6` | Informational, links |
| `card.face` | `#F7F5EF` | Playing-card face (warm ivory, not pure white) |

**Playing-card suit colors (dual system — accessibility critical):**
- *Two-color (classic):* spades/clubs `#14181F`, hearts/diamonds `#D8322B`.
- *Four-color (CVD-safe, default toggle-on option):* spades `#14181F`, hearts `#D8322B`, diamonds `#2A6FDB` (blue), clubs `#1E8E5A` (green). Ship both; four-color must be selectable in settings.

**Gradients:** navy radial for backgrounds (`bg.deep`→`bg.base`, center offset upper); emerald CTA gradient (`emerald.accent`→`#249C6E`, 180°); gold specular sweep only on premium frames/trophies.

### 1.2 Typography

| Role | Recommended typeface | Notes |
|---|---|---|
| Brand wordmark | Custom lettering based on a high-contrast humanist serif (Fraunces-like) OR confident geometric display (Clash Display-like) | Set once in vector; never diffusion-generated for final |
| Display / headings | Geometric-humanist sans, Bold/ExtraBold (Inter Display / Satoshi / Clash) | Tight tracking on large sizes |
| UI body | Inter (Regular/Medium/SemiBold) | High legibility at 12–16px |
| Numerals (chips, pots, timers) | Inter with **tabular figures** (`tnum`) | Non-jittering money/time readouts |

Italics only for short accents aligned to the wordmark. All licensed for global commercial + embedding.

### 1.3 Geometry, grid, and radii

- **Spacing base:** 4px grid. Component padding in multiples of 4 (8/12/16/24).
- **Border radius:** `xs 6` · `sm 10` · `md 14` · `lg 20` · `xl 28` · `pill 999`. UI cards `16`. Standard buttons `12`. On-table action buttons `pill`. Modals `20`.
- **Icon grid:** 24×24 master (also export 20 and 32). **2px stroke**, round caps/joins, optical alignment inside a 20px live area with 2px padding. Corner radius on stroked shapes ≥2px. Single accent color max per icon.
- **Playing card:** aspect **2.5 : 3.5** (0.714). Corner radius = 6% of card width. Base export 240×336 @1x (+@2x 480×672, +@3x 720×1008). Safe margin for index (rank+suit) = 8% inset top-left & bottom-right (rotated).
- **Chip:** perfect circle. Base 128px @1x (+@2x/@3x). Edge-stripe count encodes denomination (see §10 master). 2.5D bevel, top-down-tilted view at ~18°.

### 1.4 Lighting, perspective, material, line

- **Lighting direction:** single key **upper-left ~35°**, soft broad fill, subtle cool rim from lower-right. Consistent across ALL illustrations and 2.5D objects. Shadow color is a desaturated navy, never pure black.
- **Shadow softness:** contact shadows tight (blur ≈ 4–8% of object height, opacity 24–36%); ambient drop soft (blur ≈ 20%, opacity 12–18%).
- **Perspective:** gameplay table rendered at a **34° hero angle** (between top-down and 3/4) for readability; all UI is flat/orthographic; characters are front-facing or slight 3/4.
- **Material rendering:** matte navy surfaces with subtle micro-grain; felt with soft directional nap; gold with restrained anisotropic specular (one clean highlight, no glitter); glass/plastic chips with a single soft top highlight. Avoid heavy bloom.
- **Line weight:** illustration outlines optional and thin (1.5–2px optical at @1x); icons strictly 2px; no chunky cartoon outlines.

### 1.5 Motion language

- **Durations:** micro (state/hover) **120–200ms**; standard (enter/move) **240–320ms**; celebratory (win/reward) **600–1200ms**; ambient loops 3–8s.
- **Easing:** entrances/reveals `cubic-bezier(0.22, 0.61, 0.36, 1)` (ease-out); positional moves `cubic-bezier(0.4, 0, 0.2, 1)`; exits ease-in `cubic-bezier(0.4, 0, 1, 1)`; celebratory overshoot `cubic-bezier(0.34, 1.56, 0.64, 1)` used sparingly.
- **Frame rate:** 60fps target for UI; 30fps acceptable for long ambient sprite loops to save size.
- **Particles:** capped (≤80 confetti pieces on phones), pooled, no full-screen additive stacking; disable/reduce under "Reduce motion" and on low-end tier.
- **Restraint:** motion supports readability, never obscures cards, pot, or turn state.

### 1.6 Accessibility baseline (applies to every asset)

- Text/critical UI contrast ≥ **4.5:1** (WCAG AA); large text & non-text UI ≥ **3:1**.
- Never encode state by **color alone**: pair with icon, label, shape, or motion (e.g., active player = ring **and** avatar scale + timer; fold = dimmed **and** "FOLD" tag).
- Four-color deck option for color-vision deficiency; card indices large and high-contrast.
- Respect **prefers-reduced-motion**: provide a static/short variant of every animation.
- Minimum touch target 44×44px for all interactive controls; icons legible at 20px.
- Provide localized `alt`/label text keys for meaningful imagery (see §17 localization list).

---

## 2. Consistency requirements (shared rules)

| Dimension | Rule |
|---|---|
| Character proportions | Mature, realistic-friendly, ~7.5-head height for full body; stylized-realistic faces (not chibi, not photoreal); consistent eye-line and jaw simplification |
| Rendering | Semi-flat with soft cel + gradient shading; matched brush/edge treatment across all characters |
| Lighting direction | Upper-left key ~35° everywhere (see §1.4) |
| Perspective | Table 34° hero; UI flat; characters front / slight-3⁄4 |
| Line weight | Icons 2px; illustration outlines 1.5–2px optical or lineless-with-shape |
| Shadow softness | Per §1.4 contact + ambient spec |
| Material rendering | Matte navy, soft felt nap, restrained gold spec, single-highlight chips/glass |
| Icon grid & stroke | 24px grid, 2px stroke, round joins, one accent color |
| Border radius | Token scale §1.3 |
| Button states | Every button ships default / hover / pressed / focused / disabled / loading (+ selected where toggleable) |
| Card & chip dimensions | Fixed per §1.3 across all themes; only skin changes, never geometry |
| Animation timing | Token scale §1.5 |
| Color usage | Only palette §1.1; accent-per-surface discipline; gold ≤10% of any composition |
| Background contrast | Backgrounds must sit ≥3:1 behind foreground UI; no busy patterns behind text |
| Naming | §3.1 convention, no spaces, lower-kebab, family-prefixed |
| File organization | §3.2 tree |
| Export settings | §3.3 matrix |

**Master-prompt-first workflow:** produce/approve the family master (§4) before generating individual assets; individual assets must visibly belong to the same family (same palette, light, edge treatment, corner radius).

---

## 3. Naming, file organization, export

### 3.1 Naming convention

`{family}-{name}[-{variant}][@{scale}].{ext}`

- **Family prefixes:** `brand` · `chr` (character/avatar) · `env` (environment/background) · `tbl` (table/gameplay material) · `card` · `chip` · `ic` (icon) · `btn` (button/control) · `emo` (emote) · `anim` (animation) · `tut` (tutorial) · `empty` (empty/error state) · `mkt` (marketing).
- **Asset ID** (for this doc & tracking): `{FAM}-{NNN}`, e.g. `BRD-001`, `CHR-014`, `CARD-039`.
- Examples: `ic-lobby.svg`, `ic-lobby@2x.png`, `card-back-default.svg`, `chr-avatar-f-01-portrait@3x.png`, `anim-pot-to-winner.json`, `tbl-felt-emerald.webp`.
- States as suffixes: `-default -hover -pressed -focused -disabled -loading -selected -locked -claimed -active -winner -dim`.

### 3.2 File tree

```
/assets
  /brand        logo, wordmark, symbol, icon, favicon, splash, patterns, social
  /characters   /avatars /dealer /bots /frames /portraits /fullbody /expressions
  /environments backgrounds per screen + empty/error scenes
  /table        felt, rails, markers, seats, indicators (per theme subfolder)
  /cards        /faces /backs /states /tutorial
  /chips        /denoms /stacks /piles /tray /pot /rewards
  /icons        /nav /action /system /status /social /settings
  /buttons      /primary /action /form /states
  /emotes
  /animations   /lottie /sprites /video
  /tutorial
  /empty-states
  /marketing    /store /web /banners /social /press /email
  /_tokens      colors.json, type.json, motion.json, spacing.json
```

### 3.3 Export matrix

| Asset type | Master format | Delivery | Scales | Color |
|---|---|---|---|---|
| Icons, logo, wordmark, symbol, UI vectors, card pips | **SVG** (optimized, no embedded raster) | SVG + PNG fallback | 20/24/32; PNG @1x/@2x/@3x | sRGB |
| Favicon | SVG + ICO/PNG | 16/32/48/180(apple)/512 | — | sRGB |
| Raster sprites (chips, small props) | PNG-24 transparent | PNG | @1x/@2x/@3x | sRGB |
| Large illustrations / backgrounds | **WebP** (q80–90) | WebP + PNG fallback | phone/tablet/desktop sets | sRGB |
| Characters / portraits | PNG transparent (master), WebP delivery | PNG/WebP | @1x/@2x/@3x | sRGB |
| UI motion | **Lottie JSON** (Bodymovin) | Lottie | vector-scalable | sRGB |
| Effects w/ alpha (confetti, glow bursts) | Sprite-sheet PNG **or** WebM(VP9 alpha) + HEVC-alpha (iOS) | both | @2x | sRGB (premultiplied handled) |
| Print / press | PDF/AI + 300dpi PNG/TIFF | — | — | sRGB + CMYK proof |

- App icon final: 1024×1024 PNG, **full-bleed, square, no rounded corners, no transparency** (OS masks it). Provide adaptive-icon foreground/background layers for Android.
- All bitmaps sRGB; strip metadata; run SVGO / pngquant / cwebp in the build.
- Provide `_tokens/*.json` so engineering consumes colors/type/motion/spacing from source of truth.

---
## 4. Family master prompts

Each master defines fields 6–17 for its whole family. Individual assets inherit these and state only deltas. A shared **global negative prompt** applies on top of every family negative:

**GLOBAL NEGATIVE (append to all):** `real-money symbols, cash, banknotes, coins as currency, dollar/euro/gambling-payout imagery, casino brand logos, copyrighted card faces or chip designs, trademarked characters, celebrity likeness, watermarks, signatures, UI chrome baked into illustration, lens flare overload, heavy bloom, neon overload, glitter noise, childish cartoon, chibi, photoreal skin pores, gore, sexual content, exaggerated cultural costume, religious symbols, text gibberish, misspelled words, extra fingers, deformed hands, low-res, jpeg artifacts, muddy contrast.`

---

### 4.A Brand master (`brand-`)
- **Style/mood:** premium, modern, confident, global; elegant dark; a single restrained gold accent over deep navy + emerald; cinematic but clean.
- **Master prompt seed:** *"Original premium poker brand mark for 'MERIDIAN POKER', a refined emblem combining an abstract meridian arc / globe-latitude motif with a subtle spade or card-corner geometry, elegant geometric construction, deep navy background #10162A, emerald #2FBF87 and restrained gold #C9A227 accents, soft key light upper-left, crisp vector edges, balanced negative space, timeless not trendy."*
- **Negative:** literal playing-card clip-art, four-suit clutter, poker-chip cliché, Las Vegas signage, dice, roulette, flames.
- **Color:** navy base; emerald primary accent; gold ≤10%; monochrome variants pure `text.hi` and pure `bg.deep`.
- **Export:** SVG master; PNG @1x/2x/3x; app icon 1024² full-bleed; favicon set.
- **Consistency:** one geometric logic (grid + arc radius) reused across logo, symbol, favicon, patterns.

### 4.B Character/avatar master (`chr-`)
- **Style/mood:** stylized-realistic, warm, aspirational, globally inclusive; semi-flat cel + soft gradient; mature friendly proportions (~7.5 heads full body); confident but approachable.
- **Master prompt seed:** *"Original stylized-realistic character portrait, semi-flat cel shading with soft gradient rendering, clean 1.5px optical line, key light upper-left 35°, neutral studio rim light, calm premium mood, navy-to-charcoal seamless backdrop for cutout, tasteful modern wardrobe, natural proportions, expressive readable face."*
- **Negative:** chibi, photoreal pores, sexualized poses/outfits, exaggerated ethnic costume, cultural/religious stereotype, aggressive/violent expression, extra fingers, asymmetric eyes.
- **Color:** skin/hair full natural range; wardrobe from palette-adjacent muted tones + one accent; backdrop navy for easy cutout.
- **Composition:** portrait = head-and-shoulders centered, eye-line at 45% height; full-body = centered, grounded contact shadow.
- **Export:** PNG transparent master @1x/2x/3x; portrait square + full-body 3:4.
- **Consistency:** shared face-construction sheet (eye spacing, nose/jaw simplification), shared light, shared line weight, shared shading ramp; roster reads as one cast.

### 4.C Environment/background master (`env-`)
- **Style/mood:** cinematic-but-recessive; depth via atmospheric perspective; **must sit behind UI** — low central contrast, detail pushed to edges/corners.
- **Master prompt seed:** *"Original premium environment illustration for a poker app background, deep navy #10162A base, cinematic soft volumetric light from upper-left, emerald and gold accents used sparingly, refined 2.5D depth, clean uncluttered central zone reserved for UI, atmospheric falloff to edges, no people unless specified, no baked text or UI."*
- **Negative:** busy center, high-frequency texture behind text, readable signage text, casino brand cues, harsh neon, clutter.
- **Color:** navy dominant; emerald/gold ≤15% combined; center luminance kept mid-low for overlay contrast.
- **Composition:** 16:9 desktop + 9:19.5 phone + 4:3 tablet safe crops; central 60% low-contrast "UI safe zone."
- **Export:** WebP + PNG; per-orientation crops; optionally layered (bg/mid/fg) for parallax.
- **Consistency:** same light, same navy base, same atmospheric recipe across all screens.

### 4.D Table & gameplay-material master (`tbl-`)
- **Style/mood:** premium poker table, 2.5D at 34° hero angle; emerald felt; refined rail; maximum gameplay readability.
- **Master prompt seed:** *"Original premium Texas Hold'em poker table rendered at a 34-degree hero angle, emerald felt #123D2E with subtle directional nap and soft center vignette, elegant dark rail with restrained gold pinstripe, clearly defined community-card zone and pot zone, seat arcs around the rail, soft key light upper-left, clean and readable, no cards or chips baked in, no text."*
- **Negative:** logos on felt, baked cards/chips/text, cluttered ornament, plastic toy look, distracting patterns in card zone.
- **Color:** felt emerald; rail navy-charcoal; gold pinstripe restrained; markers use palette semantic colors.
- **Composition:** consistent table footprint & seat coordinates across themes so layout code is stable; markers designed on transparent bg to overlay.
- **Export:** table base WebP; all markers/indicators PNG/SVG transparent @1x/2x/3x.
- **Consistency:** identical geometry & seat map across every theme; only skin (felt hue, rail material) changes.

### 4.E Playing-card master (`card-`)
- **Style/mood:** classic-modern hybrid; instantly readable; warm ivory face; crisp vector pips; original court-card artwork.
- **Master prompt seed (faces):** *"Original modern playing-card design, warm ivory face #F7F5EF, crisp geometric suit pips, large high-contrast corner indices (rank + suit) top-left and bottom-right rotated, generous margins, subtle inner border, clean vector look, print-quality, optimized for small mobile screens."*
- **Court-card art seed (J/Q/K):** *"Original stylized court-card figure (jack/queen/king) as an elegant modern heraldic illustration, symmetrical two-way mirrored composition, restrained palette matching suit color + navy + gold linework, refined and dignified, no real person, no copyrighted card art."*
- **Negative:** copyrighted Bicycle/Bee/rider-back motifs, traditional French court likeness copies, cluttered filigree that hurts small-screen readability, low contrast indices.
- **Color:** face ivory; suit colors per §1.1 (ship two-color + four-color); court linework navy `#14181F` + suit accent + gold hairline.
- **Composition:** 2.5:3.5; indices in 8% safe corners; court art fits central window with 10% margin.
- **Export:** SVG per card (pips composable) + PNG @1x/2x/3x; single back + optional themed backs.
- **Consistency:** identical index typography, pip geometry, and margins across all 52; only rank/suit content changes.

### 4.F Chip/currency/reward master (`chip-`)
- **Style/mood:** premium play-money chip, 2.5D circular, tilted ~18°; clearly *virtual* (no cash symbols); denomination by color + edge stripes + inlaid value.
- **Master prompt seed:** *"Original premium virtual poker chip, circular clay-composite look, 2.5D at 18-degree tilt, patterned edge stripes, inlaid center medallion with an abstract MERIDIAN arc motif and a play-money value numeral, soft single top highlight, restrained materials, clearly a game token not real currency, transparent background."*
- **Negative:** dollar/currency symbols, real casino chip designs, metallic coin/money look, glitter, gambling payout cues.
- **Color:** denomination color code (see §10 table); medallion navy + emerald/gold accent; value numeral high-contrast.
- **Composition:** single chip centered; stacks/piles built from the single-chip master for consistency.
- **Export:** PNG transparent @1x/2x/3x; stacks as separate assets; value numerals set in vector for crispness.
- **Consistency:** identical chip silhouette/bevel/edge-slot geometry across denominations; only color + stripe pattern + numeral change.

### 4.G Icon master (`ic-`)
- **Style/mood:** clean line icons, 24px grid, 2px stroke, round caps/joins, geometric, single accent; consistent metaphor language.
- **Master prompt seed:** *"Original UI line icon, 24px grid, 2px uniform stroke, rounded caps and joins, geometric minimal construction, balanced optical weight, single-color on transparent, crisp at 20px, part of a cohesive icon family."*
- **Negative:** filled/duotone mixed into line set, inconsistent stroke widths, skeuomorphism, tiny illegible detail, drop shadows.
- **Color:** `text.hi` default; state tints use semantic tokens; one accent max.
- **Composition:** centered in 20px live area, 2px padding; align to pixel grid.
- **Export:** SVG master + PNG 20/24/32 @1x/2x/3x.
- **Consistency:** shared corner radius, stroke, terminal style, and metaphor grammar across all icons.

### 4.H Button/control master (`btn-`)
- **Style/mood:** tactile but flat-premium; clear affordance; strong focus/pressed feedback; action buttons color-coded to poker semantics.
- **Master prompt seed:** *"Original premium UI button component, pill or 12px-radius rounded rectangle, subtle top-inner highlight and soft drop shadow, emerald primary / neutral secondary / danger fold, crisp label area, states for default hover pressed focused disabled loading, on transparent background."*
- **Negative:** glossy web-2.0 gel, heavy bevel, neon glow, cluttered ornament.
- **Color:** primary emerald gradient; secondary `surface.raised` + hairline; fold `danger`; all-in gold-emerald premium accent; disabled desaturated.
- **Composition:** consistent height tiers (sm 36 / md 44 / lg 52), icon+label spacing 8px.
- **Export:** SVG components + spec; state sheet PNG for reference; Lottie for loading spinner.
- **Consistency:** one radius, one shadow recipe, one focus-ring style across all controls.

### 4.I Emote master (`emo-`)
- **Style/mood:** friendly, expressive, globally safe; matches character face-construction; readable at small size on the table.
- **Master prompt seed:** *"Original friendly poker emote sticker, single clear emotion, matches the game's character art style, bold silhouette readable at 64px, soft rim so it pops over felt, transparent background, wholesome and universally friendly."*
- **Negative:** rude/offensive gestures, cultural/religious symbols, sexual content, alcohol, trash-talk cruelty, tiny detail.
- **Color:** vivid but palette-harmonized; emerald/gold accents; high edge contrast for table legibility.
- **Composition:** centered, generous padding, subtle bottom contact shadow or glow.
- **Export:** PNG transparent @1x/2x/3x; animated variants Lottie/sprite.
- **Consistency:** same head-construction and line/shading as character family.

### 4.J Animation master (`anim-`)
- **Style/mood:** smooth, premium, short, readable; motion supports gameplay clarity; never blocks cards/pot/turn.
- **Master prompt seed (for keyframe/style refs):** *"Original premium game UI animation frames, matching MERIDIAN dark navy + emerald + gold system, clean easing, subtle particles, readable silhouettes, transparent background for compositing."*
- **Negative:** long/blocking sequences, seizure-risk strobe, screen-covering particles, jitter, motion that hides game state.
- **Spec defaults:** 60fps UI; easing per §1.5; transparency required unless a full-screen scene; Lottie for vector UI motion, sprite-sheet/WebM-alpha for particle FX; reduced-motion static fallback mandatory; mobile particle caps per §1.5.
- **Export:** Lottie JSON + sprite-sheet/WebM-alpha + HEVC-alpha (iOS).
- **Consistency:** shared timing tokens, shared particle look, shared glow color (`emerald.bright`).

### 4.K Tutorial/empty-state master (`tut-` / `empty-`)
- **Style/mood:** warm, instructive, reassuring; light illustrative spot art + clear diagram; friendly not patronizing.
- **Master prompt seed:** *"Original friendly instructional spot illustration for a poker app, clean 2.5D, navy background-safe, emerald accents, single clear focal concept, generous space for caption text, calm and encouraging mood, no baked text."*
- **Negative:** clutter, baked text/labels (added in UI for localization), gambling/cash cues, discouraging/negative tone.
- **Color:** navy + emerald + soft neutral; single accent per illustration.
- **Composition:** focal concept centered/upper, caption zone reserved below.
- **Export:** SVG/WebP transparent; layered where animated.
- **Consistency:** same illustration language as environments/characters; text always external for localization.

### 4.L Marketing/store master (`mkt-`)
- **Style/mood:** premium, aspirational, honest; showcases real UI + characters; **must not imply real-money winnings**; localization-ready layouts.
- **Master prompt seed:** *"Original premium marketing key art for a play-money poker game, cinematic dark navy scene with emerald table glow and restrained gold, hero characters mid-game, clean composition with clear space for headline and localized copy, App Store / Play / social ready, honest representation of gameplay, no real-money or cash imagery."*
- **Negative:** cash/jackpot/payout claims, 'win real money', fake testimonials, casino brand cues, cluttered copy, baked final copy (kept as editable layers).
- **Color:** full brand palette; cinematic but on-brand; gold restrained.
- **Composition:** platform-specific safe areas; copy zones as editable layers; device frames original/generic.
- **Export:** layered PSD/Figma masters; PNG/WebP exports per platform spec; PDF press.
- **Consistency:** same brand system, same character cast, same tone across every channel; include the responsible-play + "play-money, no cash value" mark where required.

---
## 5. Category 1 — Brand identity

*Inherits Brand master §4.A + global defaults. Fields not restated are inherited.*

### BRD-001 — Primary game logo (lockup)
1. **ID:** BRD-001 · 2. **Name:** Primary logo lockup · 3. **Category:** Brand identity · 4. **Screen:** Splash, headers, store, marketing · 5. **Purpose:** Master brand signature (symbol + wordmark).
6. **Prompt:** *"Original premium horizontal logo lockup for 'MERIDIAN POKER': an abstract meridian-arc emblem (a globe-latitude curve resolving into a subtle spade/card-corner) to the left of a confident custom wordmark; elegant geometric construction on a consistent grid; deep navy field, emerald #2FBF87 primary accent, one restrained gold #C9A227 hairline; balanced negative space; timeless, high-end, international."*
7. **Negative:** literal cards/chips/dice, casino signage, flames, gradients-on-text, more than two accent colors, gibberish letters (set wordmark in vector).
8. **Style/mood:** premium, timeless, confident, global.
9. **Color:** navy `#10162A` field; emerald accent; gold hairline ≤8%.
10. **Composition:** horizontal lockup, symbol : wordmark height ratio locked; clear-space = symbol height on all sides.
11. **Pose/expr:** n/a.
12. **Dimensions:** vector; reference raster 2400×800 (3:1).
13. **Background:** transparent + navy + light versions.
14. **States/variants:** horizontal, stacked, symbol-only (→BRD-003), wordmark-only (→BRD-002), light (BRD-004a), dark (BRD-004b), monochrome (BRD-005).
15. **Animation:** intro reveal → ANIM-001.
16. **Export:** SVG master; PNG @1x/2x/3x; PDF/AI.
17. **Responsive:** horizontal for desktop headers; stacked/symbol for phone compact.
18. **Accessibility:** legible at 120px wide; ≥4.5:1 wordmark on background; provide `alt="MERIDIAN POKER"`.
19. **Consistency:** defines grid/arc-radius reused by BRD-003/006/007.

### BRD-002 — Wordmark
- **Inherits BRD-001.** **Delta:** custom lettering only, no symbol; optimized tracking for small sizes; provide upper/mixed case if brand allows. **Dims:** vector, ref 2000×520. **Variants:** light/dark/mono. **Format:** SVG+PNG.

### BRD-003 — Logo symbol (app-mark)
- **Delta:** the meridian-arc/spade emblem alone, perfectly balanced in a circle and a square safe-frame; the seed of the app icon. **Dims:** vector, ref 1024². **BG:** transparent. **Variants:** light/dark/mono/1-color-knockout. **Consistency:** exact geometry reused in BRD-006/007/008.

### BRD-004 — Light & dark logo variants
- **Delta:** BRD-001 recolored for (a) light backgrounds (navy/gold marks on ivory) and (b) dark backgrounds (ivory/emerald on navy). Maintain identical contrast hierarchy. **Format:** SVG+PNG each.

### BRD-005 — Monochrome logo
- **Delta:** single-color solid version, both `text.hi` (white) and `bg.deep` (black) fills; must hold at 1-color print & embossing; no gradients. **Format:** SVG.

### BRD-006 — App icon
1. **ID:** BRD-006 · 4. **Screen:** OS launcher / stores · 5. **Purpose:** Install identity.
6. **Prompt:** *"Original app icon built from the MERIDIAN symbol (BRD-003): emerald-to-navy radial field, centered meridian-arc/spade emblem with a single restrained gold hairline, soft upper-left key light, crisp edges, full-bleed square composition, no rounded corners, no transparency, balanced at 48px."*
7. **Negative:** text/wordmark in icon, rounded corners baked, transparency, busy detail, drop shadow to edge.
9. **Color:** emerald+navy field, gold hairline.
10. **Composition:** emblem centered, 12% safe padding, works under circular & squircle masks.
12. **Dimensions:** 1024×1024. 13. **BG:** opaque, full-bleed.
14. **Variants:** iOS 1024²; Android adaptive foreground + background layers; monochrome themed-icon layer.
16. **Export:** PNG 1024²; Android adaptive XML/PNG layers.
18. **Accessibility:** recognizable at 40px; ≥3:1 emblem vs field.
19. **Consistency:** identical emblem geometry as BRD-003.

### BRD-007 — Favicon
- **Delta:** simplified BRD-003 for 16–48px; drop hairline detail at 16px; ensure clarity on light & dark browser chrome. **Dims:** 16/32/48/180/512. **Format:** SVG + ICO + PNG.

### BRD-008 — Splash-screen artwork
1. **ID:** BRD-008 · 4. **Screen:** App cold-start splash · 5. **Purpose:** Premium first impression while loading.
6. **Prompt:** *"Original premium splash scene: deep navy radial (#0A0E1A→#10162A) with soft emerald table-glow rising from lower center, faint meridian-arc light lines, subtle floating card/chip bokeh at edges, centered clear zone for the logo, cinematic calm, no baked logo or text."*
7. **Negative:** baked logo/text, busy center, bright neon, readable signage.
10. **Composition:** center-safe for logo (added in code); vignette to edges.
12. **Dimensions:** 1290×2796 (phone) + tablet 2048×2732 + desktop 1920×1080 crops. 13. **BG:** opaque.
14. **Variants:** per orientation/device; layered for subtle parallax.
15. **Animation:** ambient glow drift → ANIM-003 pairing; logo reveal ANIM-001.
16. **Export:** WebP+PNG per size. 17. **Responsive:** safe-zone holds across ratios. 18. **Accessibility:** honor reduced-motion (static). 19. **Consistency:** same navy/emerald recipe as env master.

### BRD-009 — Loading-screen artwork
- **Delta:** like BRD-008 but with reserved lower area for a progress bar/spinner and rotating tip text (added in UI); slightly lower center luminance. **Variants:** per device. **Animation:** ANIM-002 spinner + ANIM-003 ambient.

### BRD-010 — Brand-pattern backgrounds
- **Delta:** *"Seamless tiling pattern from the meridian-arc motif — thin gold/emerald latitude lines over navy, low contrast, luxury texture, non-distracting."* **Variants:** dense/sparse, navy/emerald tint. **Dims:** 1024² seamless tile. **BG:** opaque + transparent overlay version. **Use:** panels, cards, marketing fills. **Accessibility:** ≤3% luminance variation behind text.

### BRD-011 — Social-media profile image
- **Delta:** BRD-003 centered on brand radial, safe inside circular crop. **Dims:** 1024² (crops to circle). **Format:** PNG.

### BRD-012 — Social-media cover artwork
- **Delta:** BRD-008-style key art + wordmark + tagline zone; per-network safe areas (X 1500×500, FB 820×312, YouTube 2560×1440, LinkedIn 1128×191). **Variants:** per network. **Format:** PNG/WebP layered.

### BRD-013 — Store promotional graphics (feature/hero)
- **Delta:** Play **feature graphic 1024×500**, App Store hero, promo tiles; brand key art + wordmark + "Play-money poker" honest tagline; no cash claims. **Variants:** Play feature, iOS promo, generic banner. **Format:** PNG/WebP; layered master. **See also** Category 12 for full store sets.

---
## 6. Category 2 — Characters and avatars

*Inherits Character master §4.B. Global inclusivity rule: represent diverse ages, ethnicities, body types, and modern fashion respectfully; avoid stereotype, costume caricature, sexualization, and religious symbols.*

### CHR-000 — Character construction sheet (foundation, produce FIRST)
1. **ID:** CHR-000 · 5. **Purpose:** Lock proportions/light/shading so the whole cast is consistent (not an in-app asset).
6. **Prompt:** *"Character design model sheet: front + 3/4 + profile of a neutral base head and full body, semi-flat cel + soft gradient shading, 1.5px optical line, upper-left 35° key light, defined eye-line ratios, jaw/nose simplification guide, shading ramp swatches, mature friendly proportions ~7.5 heads."*
14. **Variants:** male base, female base, neutral base. 16. **Export:** reference PNG/PDF. 19. **Consistency:** every CHR asset must match this sheet.

### CHR-001 — Default anonymous avatar
1. **ID:** CHR-001 · 4. **Screen:** Everywhere a user has no avatar · 5. **Purpose:** Neutral fallback identity.
6. **Prompt:** *"Original neutral default avatar: friendly abstract head-and-shoulders silhouette in emerald-on-navy, simple geometric, gender-neutral, warm not cold, inside a circular safe frame."* 7. **Negative:** face detail that implies a specific person, gender cues. 12. **Dims:** 512² (circle-cropped). 13. **BG:** transparent + navy disc. 14. **Variants:** light/dark, 3 subtle color options. 16. **Export:** SVG+PNG @1x/2x/3x. 18. **Accessibility:** ≥3:1 vs seat background.

### CHR-002 — Dealer / game-host character
1. **ID:** CHR-002 · 4. **Screen:** Tables, tutorials, onboarding · 5. **Purpose:** Warm guide/host presence.
6. **Prompt:** *"Original dealer/host character, warm professional, smart modern dealer attire (no casino brand), welcoming confident expression, semi-flat cel shading, upper-left key light, front and slight-3/4 views, suitable as a friendly guide throughout the app."* 7. **Negative:** stereotype croupier costume, cash/chips-as-money cues. 11. **Pose/expr:** welcoming, presenting-hand gesture. 12. **Dims:** portrait 512², full-body 900×1200 (3:4). 13. **BG:** transparent. 14. **Variants:** 2 appearances (rotatable), expression set (see CHR-EXPR table), presenting/dealing poses. 15. **Animation:** idle + dealing → ANIM-006/012. 19. **Consistency:** matches CHR-000; anchors tutorial art.

### CHR-003 … CHR-014 — Player avatar roster (diverse, 12 base characters)
*Inherits §4.B. Each: portrait (512² circle-safe) + optional full-body (3:4). Produce as a matched cast (same light/line/shading). Deltas below; all get the CHR-EXPR expression set + CHR-POSE pose set as needed for gameplay.*

| ID | Name | Archetype | Delta (appearance brief — original, respectful, non-stereotyped) |
|---|---|---|---|
| CHR-003 | `chr-avatar-f-01` | Beginner, female | young adult, casual hoodie, curious friendly, East-Asian features |
| CHR-004 | `chr-avatar-m-01` | Beginner, male | young adult, casual tee + cap, easygoing, Latin-American features |
| CHR-005 | `chr-avatar-n-01` | Casual, neutral | 30s, smart-casual, calm confident, South-Asian features |
| CHR-006 | `chr-avatar-f-02` | Casual, female | 40s, blazer, warm assured, Black/African features, natural hair |
| CHR-007 | `chr-avatar-m-02` | Casual, male | 50s, sweater, thoughtful, Middle-Eastern features, groomed beard |
| CHR-008 | `chr-avatar-f-03` | Professional, female | 30s, sharp modern suit, focused, European features |
| CHR-009 | `chr-avatar-m-03` | Professional, male | 40s, tailored jacket, composed, Southeast-Asian features |
| CHR-010 | `chr-avatar-n-02` | Professional, neutral | 30s, minimalist chic, cool poised, mixed/ambiguous features |
| CHR-011 | `chr-avatar-f-04` | High-level, female | 50s, elegant statement piece, commanding calm, Indigenous-American features |
| CHR-012 | `chr-avatar-m-04` | High-level, male | 60s, refined attire, veteran gravitas, Black/Caribbean features |
| CHR-013 | `chr-avatar-f-05` | Casual, female | 20s, sporty modern, upbeat, Pacific-Islander features |
| CHR-014 | `chr-avatar-m-05` | Casual, male, older | 70s, cardigan, kind wise, Nordic/European features, glasses |

- **Variants each:** portrait + full-body + full expression set + gameplay pose set + selection thumbnail.
- **Format:** PNG transparent @1x/2x/3x; portrait square, full-body 3:4.
- **Accessibility:** distinct silhouettes/colors so players tell seats apart at a glance.

### CHR-015 … CHR-019 — Bot-player characters (5, distinct personalities)
*Visually part of the cast but with a subtle bot tag (small emerald circuit-dot pin) and personality cue.*

| ID | Name | Personality | Delta |
|---|---|---|---|
| CHR-015 | `chr-bot-rookie` | Cautious rookie | timid posture, soft colors, small bot-pin |
| CHR-016 | `chr-bot-shark` | Aggressive shark | sharp confident, cool blues, subtle smirk |
| CHR-017 | `chr-bot-joker` | Playful trickster | relaxed grin, warm accent, casual |
| CHR-018 | `chr-bot-calc` | Analytical calculator | composed, glasses, neutral, subtle HUD motif |
| CHR-019 | `chr-bot-veteran` | Steady veteran | calm gravitas, muted palette |

- **Variants:** portrait + expression subset (confident/thinking/win/lose) + bot-pin. **Format:** PNG @1x/2x/3x.

### CHR-020 — Locked-character silhouette
- **Delta:** any roster character rendered as a navy silhouette with a soft emerald rim and a lock glyph overlay; "unlockable" feel. **Dims:** 512². **BG:** transparent. **Variants:** per character (procedural) + generic. **Consistency:** exact silhouette of the real character.

### CHR-021 — Premium avatar frames
- **Delta:** *"Original circular avatar frame, restrained gold + emerald, elegant geometric meridian motif, tasteful premium, transparent center."* **Variants:** 4 tiers (bronze/silver/gold/prestige) using metal-restraint. **Dims:** 640² (fits 512 avatar). **Format:** PNG/SVG transparent. **Accessibility:** frame never reduces avatar contrast.

### CHR-022 — Rank-specific avatar borders
- **Delta:** border style keyed to rank tier (see §11 ranks): color + emblem accent per tier; consistent thickness. **Variants:** one per rank tier. **Format:** SVG+PNG. **Consistency:** shares geometry with CHR-021.

### CHR-EXPR — Expression set (per hero character)
*Each expression rendered on the same head-construction. Portrait crop 512². States apply to CHR-002..014 (and subset for bots).*

| ID suffix | Expression | Use |
|---|---|---|
| `-expr-confident` | Confident | strong hand / raising |
| `-expr-happy` | Happy | win, positive events |
| `-expr-disappointed` | Disappointed | loss/fold |
| `-expr-surprised` | Surprised | big swing / all-in called |
| `-expr-focused` | Focused | thinking on turn |
| `-expr-celebratory` | Celebratory | victory/showdown win |

### CHR-POSE — Pose set (full-body/half, per character where shown)
| ID suffix | Pose | Use |
|---|---|---|
| `-pose-idle` | Idle | waiting at seat |
| `-pose-thinking` | Thinking | decision timer active |
| `-pose-betting` | Betting | pushing chips in |
| `-pose-winning` | Winning | collecting pot |
| `-pose-losing` | Losing | folded/eliminated |
| `-pose-allin` | All-in | dramatic shove |

### CHR-023 — Profile portraits (framed hi-detail)
- **Delta:** higher-detail bust of any character for the profile screen, soft background glow, room for frame. **Dims:** 720×720. **Format:** PNG/WebP.

### CHR-024 — Full-body character illustrations
- **Delta:** marketing/selection full-body of hero characters, dynamic but tasteful stance, grounded shadow. **Dims:** 1200×1600 (3:4). **Format:** PNG transparent.

### CHR-025 — Character-selection thumbnails
- **Delta:** consistent cropped bust of each character on a subtle navy tile with name zone; selected/locked states. **Dims:** 240×240. **States:** default/selected/locked. **Format:** PNG @1x/2x/3x.

---
## 7. Category 3 — Environments and backgrounds

*Inherits Environment master §4.C. Every environment keeps a low-contrast central "UI safe zone" and ships phone (9:19.5), tablet (4:3), desktop (16:9) crops as WebP+PNG. All: opaque bg, honor reduced-motion for any ambient layer, ≥3:1 behind foreground UI, no baked text.*

### ENV-001 — Main lobby background
- **Delta:** *"Premium lobby atmosphere: navy hall with a soft emerald glow horizon, faint meridian light arcs, distant blurred table silhouettes, luxurious but calm, wide clean center for lobby cards/nav."* **Animation:** subtle drift → ANIM-004. **Priority:** MVP.
### ENV-002 — Beginner poker room
- **Delta:** friendly, brighter, approachable; softer emerald, gentle warm accent; welcoming "practice" feel; low clutter. **Priority:** MVP.
### ENV-003 — Casual social room
- **Delta:** cozy lounge vibe, warm secondary accent, relaxed; hints of social presence (blurred avatars at edges). **Priority:** Recommended.
### ENV-004 — Premium casino room (play-money)
- **Delta:** refined dark hall, restrained gold architectural accents, emerald table pool of light; upscale, never gaudy. **Priority:** Recommended.
### ENV-005 — High-stakes-inspired room (play-money)
- **Delta:** dramatic, deeper contrast, focused spotlight on center, cool rim, prestige mood; **clearly labeled play-money in UI**, no cash cues. **Priority:** Recommended.
### ENV-006 — Tournament arena
- **Delta:** larger stadium-like depth, tiered ambient lights, energetic but controlled, banner zones (art only, text external). **Animation:** slow crowd/light shimmer. **Priority:** MVP (basic tournaments).
### ENV-007 — Private table room
- **Delta:** intimate den, warm restrained lighting, "invite-only" cozy prestige, subtle lock/key motif at edges. **Priority:** Recommended.
### ENV-008 — Night-city environment
- **Delta:** panoramic navy skyline through a window behind a lounge, soft city bokeh, emerald interior glow; atmospheric, low center detail. **Priority:** Future.
### ENV-009 — Luxury lounge environment
- **Delta:** velvet + wood + subtle gold, warm premium seating ambience, calm; alternate profile/menu backdrop. **Priority:** Future.
### ENV-010 — Modern digital poker studio
- **Delta:** sleek broadcast-studio look, clean panels, emerald screens (no readable text), contemporary tech feel. **Priority:** Future.
### ENV-011 — Neutral loading background
- **Delta:** minimal navy radial + faint arcs; lowest detail; pairs with BRD-009. **Priority:** MVP.
### ENV-012 — Profile background
- **Delta:** calm navy gradient with soft emerald glow lower-left, space for portrait/stats panels; unobtrusive. **Priority:** MVP.
### ENV-013 — Rankings background
- **Delta:** subtle ascending light motif / podium glow at base, aspirational, center-safe for leaderboard list. **Priority:** Recommended.
### ENV-014 — Rewards & achievements background
- **Delta:** warm celebratory-but-restrained navy with soft gold sparkle at edges (subtle), space for grid. **Priority:** Recommended.
### ENV-015 — Settings & help background
- **Delta:** flattest, quietest navy; near-zero center detail for dense forms/lists. **Priority:** MVP.
### ENV-016 — Empty-state illustration backdrops
- **Delta:** soft neutral navy stage for empty-state spot art (see Category 11); very low contrast. **Priority:** MVP.
### ENV-017 — Maintenance & connection-error backgrounds
- **Delta:** calm reassuring navy with a single friendly focal motif zone (spot art added), non-alarming; distinct for maintenance vs offline. **Variants:** maintenance / no-connection / server-error. **Priority:** MVP.

---
## 8. Category 4 — Poker tables and gameplay materials

*Inherits Table master §4.D. CRITICAL: table geometry & seat map are IDENTICAL across all themes — only skin changes. Markers/indicators ship transparent PNG/SVG @1x/2x/3x to overlay. Nothing baked (no cards/chips/text on felt).*

### TBL-001 — Complete poker-table design (base, Emerald theme)
1. **ID:** TBL-001 · 4. **Screen:** All gameplay · 5. **Purpose:** Canonical table surface + layout footprint.
6. **Prompt:** Table master seed, Emerald theme; define seat arcs (2/4/6/9-max layouts), community-card strip, pot zone, dealer arc. 10. **Composition:** 34° hero; fixed seat coordinates documented for engineering. 12. **Dims:** 2000×1400 base (+device crops). 13. **BG:** opaque (felt) + transparent version for compositing over ENV. 14. **Variants:** 2-max/6-max/9-max layouts. 15. **Animation:** none (static surface). 19. **Consistency:** seat map is the reference for all overlays.

### TBL-002…005 — Additional table themes (skins)
| ID | Theme | Delta |
|---|---|---|
| TBL-002 | Emerald (default) | included as TBL-001 |
| TBL-003 | Sapphire Night | deep blue felt `#123A5C`, silver rail |
| TBL-004 | Onyx Prestige | near-black felt, restrained gold rail (premium) |
| TBL-005 | Classic Green | traditional green felt, wood rail (nostalgic) |
- **Rule:** identical geometry/seat coords; only felt hue + rail material differ. **Format:** WebP+PNG per device.

### TBL-006 — Table-felt textures (tileable)
- **Delta:** seamless felt nap texture per theme, subtle directional weave, center vignette; used to skin the surface. **Dims:** 1024² seamless. **Format:** WebP + PNG.
### TBL-007 — Table borders & rails
- **Delta:** rail ring art per theme (leather/wood/metal-restrained), soft top highlight, transparent inner. **Format:** PNG/SVG transparent.
### TBL-008 — Dealer position marker (seat arc)
- **Delta:** subtle emerald arc/glow marking the dealer seat position (distinct from dealer BUTTON TBL-016). **Format:** PNG/SVG transparent.

### TBL-009…024 — Markers, zones & indicators (transparent overlays)
| ID | Asset | Prompt delta | States/variants |
|---|---|---|---|
| TBL-009 | Player-seat area | seat plate w/ avatar slot, name & stack zones, subtle emerald frame | empty / occupied / active / folded / winner / disconnected |
| TBL-010 | Empty-seat indicator | dim outlined seat with "Sit here" affordance zone | default / hover |
| TBL-011 | Community-card area | subtle recessed strip guide for 5 cards | flop/turn/river highlight |
| TBL-012 | Pot area | central pot plinth glow + count zone | main / side / growing |
| TBL-013 | Betting zones | per-seat bet-placement pad in front of each seat | idle / has-bet / matched |
| TBL-014 | Table-number sign | elegant plate for table # / stakes (text external) | default |
| TBL-015 | Small/Big blind markers | two small chips-badges labeled SB/BB (text external, shape+color coded) | SB / BB |
| TBL-016 | Dealer button | premium "D" button token, restrained gold-emerald, clearly a game token | default / moving |
| TBL-017 | All-in marker | dramatic emerald-gold "ALL-IN" badge (icon+shape, label external) | default / pulsing |
| TBL-018 | Turn indicator | ring/arc + arrow showing whose turn | default / countdown-tinted |
| TBL-019 | Active-player highlight | emerald glow ring + slight seat scale | active |
| TBL-020 | Winner highlight | gold-emerald celebratory ring/burst around winning seat | win |
| TBL-021 | Side-pot indicators | small stacked pot badges with # tag | 1 / 2 / 3+ |
| TBL-022 | Spectator-state indicator | subtle "eye" badge on seat/HUD for watchers | watching |
| TBL-023 | Connection-status indicator | signal-dot on seat: good/weak/lost (icon+color, see IC set) | good / weak / lost |
| TBL-024 | Card placeholder on table | soft rounded slot where a card will land | empty / dealing |

- **All:** transparent PNG/SVG @1x/2x/3x; state by shape+icon+color (never color alone); align to TBL-001 seat map.

---
## 9. Category 5 — Playing cards

*Inherits Card master §4.E. Production method: build each card in **vector** from shared parts (index typography + pip geometry + court art) so all 52 are perfectly consistent and mobile-crisp. Ship SVG per card + PNG @1x/2x/3x. Two-color and four-color suit sets both required (accessibility).*

### CARD-000 — Card template & parts kit (produce FIRST)
- **Delta:** master card frame (2.5:3.5, 6% corner radius, inner border, 8% index safe corners), the four suit pip glyphs, the rank index typeface set (A,2–10,J,Q,K), and pip-layout maps for 2–10. Everything else composes from this. **Export:** SVG symbol library. **Consistency:** single source for all 52.

### CARD-001…004 — Suit symbols (4)
| ID | Suit | Two-color | Four-color |
|---|---|---|---|
| CARD-001 | Spade ♠ | `#14181F` | `#14181F` |
| CARD-002 | Heart ♥ | `#D8322B` | `#D8322B` |
| CARD-003 | Diamond ♦ | `#D8322B` | `#2A6FDB` |
| CARD-004 | Club ♣ | `#14181F` | `#1E8E5A` |
- **Delta:** original geometric pip glyphs, balanced, crisp at 12px. **Format:** SVG. **Accessibility:** distinct silhouettes so suit reads by shape too.

### CARD-005…043 — Number & Ace faces (A,2–10 × 4 suits = 40)
- **Delta:** compose from CARD-000: correct pip count/layout + corner indices; Ace = single large centered decorative pip (subtle meridian flourish, original). **Naming:** `card-{suit}-{rank}` e.g. `card-spade-a`, `card-heart-07`. **States:** face-up (default). **Format:** SVG + PNG @1x/2x/3x each. **Accessibility:** indices ≥ 14% card height, ≥4.5:1 on ivory.

### CARD-044…055 — Court cards J/Q/K (12)
- **Delta:** original heraldic court illustration per rank+suit (court seed §4.E); two-way mirrored; suit-colored + navy line + gold hairline; dignified, no real-person likeness. **Naming:** `card-{suit}-{j|q|k}`. **Format:** SVG/vector art + PNG @1x/2x/3x. **Consistency:** all 12 share pose language & framing; only regalia motif differs by rank, tint by suit.

### CARD-056 — Card-back design (default)
1. **ID:** CARD-056 · 5. **Purpose:** Face-down card.
6. **Prompt:** *"Original card back: navy field with an emerald meridian-arc lattice, restrained gold center medallion (MERIDIAN motif), symmetrical, elegant, safe bleed margins, immediately distinct from faces, print-quality."* 7. **Negative:** copyrighted rider-back/ornate cherub motifs. 12. **Dims:** 2.5:3.5. 13. **BG:** opaque card. 14. **Variants:** default + 3 themed backs (matching TBL themes) + seasonal. 16. **Export:** SVG+PNG. 19. **Consistency:** mirrors table theme skins.

### CARD-057…064 — Card states (apply to any card)
| ID | State | Delta |
|---|---|---|
| CARD-057 | Face-up | full face visible (default) |
| CARD-058 | Face-down | shows CARD-056 back |
| CARD-059 | Selected | subtle lift + emerald outline glow |
| CARD-060 | Winning-hand highlight | gold-emerald glow + slight scale, pairs w/ ANIM-017 |
| CARD-061 | Losing/dimmed | desaturated + 55% opacity |
| CARD-062 | Card shadow | soft contact + drop shadow asset (separate layer) |
| CARD-063 | Card placeholder | empty rounded slot outline |
| CARD-064 | Deck-stack illustration | neat stack of backs w/ side thickness |
- **Format:** SVG/PNG transparent; states are overlays/filters so any of the 53 base cards can adopt them.

### CARD-065 — Joker (decorative only)
- **Delta:** original playful joker/host motif (ties to dealer character), used decoratively (loading, empty states) — **not** in gameplay deck. **Format:** SVG+PNG.

### CARD-066 — Tutorial card examples
- **Delta:** oversized annotated cards for teaching hand ranks (labels external for localization); clean and legible. **Format:** SVG+PNG. **See** Category 11 hand-ranking chart.

---
## 10. Category 6 — Chips, currencies, and rewards

*Inherits Chip master §4.F. MANDATE: everything reads as **virtual play-money** — no cash/currency symbols. Denomination = color + edge-stripe pattern + inlaid numeral. All transparent PNG @1x/2x/3x; numerals set in vector.*

### CHIP-000 — Chip master token (produce FIRST)
- **Delta:** the single canonical chip (silhouette, bevel, edge-slot geometry, center medallion). All denominations recolor this; all stacks/piles are built from it. **Export:** PNG + layered source.

### CHIP-001…008 — Denominations (color-coded)
| ID | Value (play chips) | Body color | Edge stripes |
|---|---|---|---|
| CHIP-001 | 5 | slate `#3A4763` | 2 |
| CHIP-002 | 25 | emerald `#2FBF87` | 3 |
| CHIP-003 | 100 | navy `#1E273F` | 4 |
| CHIP-004 | 500 | violet `#7A5CC7` | 4 |
| CHIP-005 | 1K | crimson `#C0413F` | 5 |
| CHIP-006 | 5K | teal `#2A9D9A` | 5 |
| CHIP-007 | 25K | gold-restrained `#C9A227` | 6 |
| CHIP-008 | 100K | prestige onyx+gold | 6 |
- **Delta:** recolor CHIP-000 + set numeral + stripe count; ensure each denomination distinct by color AND stripe count (CVD-safe). **States:** default / selected (bet chip) / stacked.

### CHIP-009…014 — Aggregations & pot
| ID | Asset | Delta |
|---|---|---|
| CHIP-009 | Individual chip view | large hero single chip (profile/store) |
| CHIP-010 | Chip stack | vertical stack of one denom, 3–20 tall variants |
| CHIP-011 | Chip pile | messy central pile (pot look) mixed denoms |
| CHIP-012 | Chip tray | dealer tray of sorted denominations |
| CHIP-013 | Pot illustration | central pot pile + glow plinth (pairs TBL-012) |
| CHIP-014 | Play-money currency symbol | original abstract chip-glyph "currency" mark (NOT $/€), used in balances |
- **Format:** PNG transparent @1x/2x/3x.

### RWD-001…013 — Rewards, currencies & progression
*Inherits §4.F reward mood; premium but clearly virtual/celebratory.*

| ID | Asset | Prompt delta | States |
|---|---|---|---|
| RWD-001 | Daily reward | calendar-style daily gift tile w/ chip burst | available / claimed / locked |
| RWD-002 | Login reward | streak flame/arc + chip stack (streak count external) | day-1..7 tiers |
| RWD-003 | Tournament ticket | elegant ticket token w/ meridian motif (text external) | valid / used |
| RWD-004 | Experience points (XP) | glowing emerald XP orb/spark glyph | default |
| RWD-005 | Rank points (RP) | gold-emerald rank shard glyph | default |
| RWD-006 | Trophy | original premium trophy, restrained gold+emerald | bronze/silver/gold/prestige |
| RWD-007 | Medal | ribboned medal, tasteful | tiers |
| RWD-008 | Achievement badge | modular badge frame + swappable emblem | locked / unlocked / new |
| RWD-009 | Reward chest | premium chest, meridian latch | closed / opening / open (pairs ANIM-026) |
| RWD-010 | Gift box | wrapped gift, emerald ribbon | closed / open |
| RWD-011 | Locked reward | any reward as silhouette + lock glyph | locked |
| RWD-012 | Claimed reward | reward + check seal + subtle dim | claimed |
| RWD-013 | Bonus indicator | small "+bonus" burst badge (icon+shape) | default / pulsing |
- **Format:** PNG/SVG transparent @1x/2x/3x; badge frame + emblem separated for scalability. **Accessibility:** state via icon+shape+label, not color alone.

---
## 11. Category 7 — Interface icons

*Inherits Icon master §4.G. All: 24px grid, 2px stroke, round joins, single color `text.hi` default, SVG + PNG 20/24/32 @1x/2x/3x, transparent. States: default / active (emerald fill-accent) / disabled (text.low). Each prompt delta describes the original metaphor; keep metaphors globally legible.*

### Navigation & primary (IC-001…013)
| ID | Icon | Metaphor delta |
|---|---|---|
| IC-001 | Home | simple house, balanced roof |
| IC-002 | Lobby | grid of table-dots / hall |
| IC-003 | Play | rounded triangle in a soft ring |
| IC-004 | Tables | top-down table oval w/ seats |
| IC-005 | Tournaments | bracket + small trophy accent |
| IC-006 | Private room | table oval + small lock |
| IC-007 | Friends | two-person duo |
| IC-008 | Profile | single person bust |
| IC-009 | Rankings | podium / ascending bars |
| IC-010 | Achievements | medal/rosette outline |
| IC-011 | Rewards | gift/chest outline |
| IC-012 | Store (virtual chips) | chip + tag (no cash) |
| IC-013 | Settings | gear, 8-tooth balanced |

### System & info (IC-014…026)
| ID | Icon | Metaphor delta |
|---|---|---|
| IC-014 | Help | question in circle |
| IC-015 | Information | "i" in circle |
| IC-016 | Tutorial | graduation cap / guiding dot path |
| IC-017 | Sound (SFX) | speaker + short wave |
| IC-018 | Music | eighth-note |
| IC-019 | Notifications | bell |
| IC-020 | Language | globe + "A/文" glyph hint |
| IC-021 | Accessibility | universal-access person-in-circle |
| IC-022 | Security | shield |
| IC-023 | Privacy | shield + keyhole / eye-off |
| IC-024 | Responsible play | clock + heart / balance scale (calm, supportive) |
| IC-025 | Chat | speech bubble |
| IC-026 | Emotes | smiley in bubble |

### Social & sharing (IC-027…032)
| ID | Icon | Metaphor delta |
|---|---|---|
| IC-027 | Add friend | person + plus |
| IC-028 | Invite | envelope + plus / paper-plane |
| IC-029 | Share | node-share glyph |
| IC-030 | Search | magnifier |
| IC-031 | Filter | funnel |
| IC-032 | Sort | up/down bars |

### Actions & controls (IC-033…049)
| ID | Icon | Metaphor delta |
|---|---|---|
| IC-033 | Refresh | circular arrows |
| IC-034 | Back | chevron-left |
| IC-035 | Close | X |
| IC-036 | Confirm | check |
| IC-037 | Cancel | X in circle / slashed |
| IC-038 | Edit | pencil |
| IC-039 | Delete | trash |
| IC-040 | Lock | padlock closed |
| IC-041 | Unlock | padlock open |
| IC-042 | Visibility | eye |
| IC-043 | Visibility-off | eye slashed |
| IC-044 | Full screen | expand corners |
| IC-045 | Minimize | collapse corners |
| IC-046 | Volume | speaker + level arcs (with muted variant) |
| IC-047 | Camera | camera (avatar photo) |
| IC-048 | Logout | door + arrow-out |
| IC-049 | More | three-dot / overflow |

### Poker gameplay-action icons (IC-050…056)
| ID | Icon | Metaphor delta |
|---|---|---|
| IC-050 | Check | knuckle-tap / open-hand tap glyph |
| IC-051 | Call | chip + equals / matching chip |
| IC-052 | Bet | chip + up-arrow |
| IC-053 | Raise | double up-arrow / stacked chips up |
| IC-054 | Fold | folding cards glyph |
| IC-055 | All-in | chips-shove burst glyph |
| IC-056 | Auto-actions (check/fold, call-any) | small toggle glyphs set |

### Status & feedback icons (IC-057…070)
| ID | Icon | Metaphor delta |
|---|---|---|
| IC-057 | Connection: good | full signal bars |
| IC-058 | Connection: weak | partial bars + amber |
| IC-059 | Connection: lost | bars + slash + danger |
| IC-060 | Loading | spinner ring (animated → ANIM-002) |
| IC-061 | Success | check-circle emerald |
| IC-062 | Warning | triangle-! amber |
| IC-063 | Error | circle-! danger |
| IC-064 | Timer | clock/hourglass |
| IC-065 | Dealer button glyph | small "D" token (HUD) |
| IC-066 | Blinds | SB/BB chip glyph |
| IC-067 | Spectator | eye-badge |
| IC-068 | New / badge dot | small filled dot / "NEW" tag shape |
| IC-069 | Star / favorite | star outline+fill |
| IC-070 | Chip balance glyph | mini chip (for balance readouts) |

- **Consistency:** all 70 share stroke, corner radius, terminal style, optical weight; produce as one SVG sprite/font. **Accessibility:** each pairs with a text label in UI; active state adds fill, never color-only.

---
## 12. Category 8 — Buttons and controls

*Inherits Button master §4.H. EVERY control ships full state set: default / hover / pressed / focused / disabled / loading (+ selected where toggleable). SVG components + spec; state reference sheets PNG. Focus ring = 2px emerald.bright offset; disabled = desaturate + 45% opacity.*

### BTN-001…002 — Primary & secondary buttons
- **BTN-001 Primary:** emerald gradient, `text.hi` label, md height 44, radius 12; hover +6% lift, pressed inset, loading→spinner.
- **BTN-002 Secondary:** `surface.raised` + hairline border, `text.hi` label; same geometry/states.

### BTN-003…008 — Poker action buttons (table)
| ID | Button | Color | Notes |
|---|---|---|---|
| BTN-003 | Check | neutral emerald-outline | pill, IC-050 |
| BTN-004 | Call | emerald | shows amount zone (text external), IC-051 |
| BTN-005 | Bet | emerald-strong | opens slider, IC-052 |
| BTN-006 | Raise | emerald-strong + up motif | opens slider, IC-053 |
| BTN-007 | Fold | `danger` | IC-054 |
| BTN-008 | All-in | gold-emerald premium | dramatic, IC-055, pairs ANIM-016 |
- **All:** pill radius, lg height 52 on table, big touch target ≥56px, full state set, one-hand reachable placement note.

### BTN-009…010 — Confirm & cancel
- **BTN-009 Confirm:** emerald + check. **BTN-010 Cancel:** neutral/ghost + X. Modal-standard pairing.

### BTN-011…015 — Table-flow buttons
| ID | Button | Delta |
|---|---|---|
| BTN-011 | Join table | primary emerald + IC-004 |
| BTN-012 | Create table | primary + plus |
| BTN-013 | Sit down | seat-context primary |
| BTN-014 | Leave table | secondary/ghost + door |
| BTN-015 | Rebuy / add chips (play) | secondary + chip (clearly virtual) |

### BTN-016…017 — Bet sizing controls
- **BTN-016 Bet slider:** premium horizontal slider, emerald fill track, chip-knob handle, min/max + pot-fraction quick pips (½, ¾, Pot, Max); states incl. dragging. **Dims:** responsive width. **Accessibility:** keyboard/step support, large handle ≥28px, numeric readout.
- **BTN-017 Chip-value selector:** row of denomination chips to compose a bet; selected/disabled states; matches CHIP set.

### BTN-018…027 — Form controls & navigation
| ID | Control | Delta / states |
|---|---|---|
| BTN-018 | Toggle switch | pill track, emerald when on; on/off/disabled/focused |
| BTN-019 | Checkbox | 6px-radius box + check; unchecked/checked/indeterminate/disabled/focused |
| BTN-020 | Radio button | ring + emerald dot; states as checkbox |
| BTN-021 | Tabs | underline-emerald active; default/active/hover/disabled |
| BTN-022 | Dropdown / select | field + chevron; closed/open/focused/disabled + menu rows |
| BTN-023 | Pagination | number pills + prev/next; current/hover/disabled |
| BTN-024 | Tooltip | small dark bubble + arrow; text external |
| BTN-025 | Progress bar | emerald fill on track; determinate + indeterminate |
| BTN-026 | Turn timer | circular countdown ring around avatar; full→empty, color shifts emerald→warning→danger, pairs ANIM-018 |
| BTN-027 | Segmented control | grouped toggle (e.g., cash/tournament filter); selected state |

### BTN-028…029 — Overlays
- **BTN-028 Modal window:** `surface` panel, 20 radius, soft shadow, header/body/footer zones, scrim `bg.deep` 60%; sizes sm/md/lg; enter/exit → ANIM-042.
- **BTN-029 Toast notification:** compact pill/card, leading status icon (IC-061/062/063), text zone; success/warning/error/info; auto-dismiss; enter/exit motion.

- **Global states note:** disabled/pressed/hovered/focused/loading/selected are delivered for all above as a component state sheet.

---
## 13. Category 9 — Emotes and social reactions

*Inherits Emote master §4.I. All: friendly & globally safe, readable at 64px over felt, static PNG @1x/2x/3x + short animated Lottie variant, transparent, subtle contact glow. Match character face-construction. No offensive/rude/cultural/religious/alcohol content.*

| ID | Emote | Prompt delta | Animated behavior (Lottie, 600–900ms, no loop unless noted) |
|---|---|---|---|
| EMO-001 | Happy | bright smile face/sticker | gentle bounce + sparkle |
| EMO-002 | Laughing | joyful laugh, eyes closed | shake + laugh puffs |
| EMO-003 | Surprised | wide eyes, "oh!" | pop-scale + exclaim |
| EMO-004 | Nervous | sweat-drop, uneasy smile | small tremble + sweat |
| EMO-005 | Thinking | hand-to-chin, focused | thought-dots cycle (loop) |
| EMO-006 | Confident | smirk + subtle brow | slow assured nod |
| EMO-007 | Unlucky | sighing, wilted | droop + tiny cloud |
| EMO-008 | Congratulations | cheer w/ small banner (icon, no text) | rise + confetti puff |
| EMO-009 | Good game (GG) | friendly thumbs-nod / handshake glyph | gentle emphasis |
| EMO-010 | Well played | tip-of-hat / respectful nod | tip + shine |
| EMO-011 | All-in | dramatic determined face + chips | push + emerald flash |
| EMO-012 | Celebration | arms-up joy | jump + confetti burst |
| EMO-013 | Friendly greeting | warm wave | wave loop (2 cycles) |
| EMO-014 | Applause | clapping hands | clap loop (3x) + spark |
| EMO-015 | Playful challenge | wink + point, sporting | wink + point pop |

- **Consistency:** shared sticker shape language, rim, and shadow; harmonized with brand palette. **Accessibility:** each has a text label/name for screen readers; motion respects reduced-motion (show static).

---
## 14. Category 10 — Animated assets and visual effects

*Inherits Animation master §4.J. Every entry below specifies the required animation fields. Defaults unless noted: 60fps, transparent, easing per §1.5, Lottie for vector UI / sprite-sheet or WebM-alpha(+HEVC-alpha) for particles, **reduced-motion static fallback mandatory**, mobile particle caps per §1.5. Timing tokens: micro 120–200ms, standard 240–320ms, celebratory 600–1200ms.*

**Field legend per row:** Start→End · Movement/Timing · Duration · Loop · Easing · Particles · Transparency · Format · Mobile perf.

| ID | Animation | Spec |
|---|---|---|
| ANIM-001 | Logo introduction | hidden→full logo · arc draws in then wordmark fades/slides · 1200ms · no · ease-out (+overshoot on symbol) · faint sparkle ≤12 · yes · Lottie · lightweight vector |
| ANIM-002 | Loading indicator | 0→360° · emerald arc spin · 900ms · **yes** · linear · none · yes · Lottie · tiny |
| ANIM-003 | Lobby ambient motion | rest→drift · slow light/arc parallax · 6–8s · **yes** · ease-in-out · slow bokeh ≤20 · n/a (bg) · Lottie/WebM · 30fps ok, low-tier disable |
| ANIM-004 | Lobby ambient (alt) | same recipe for menu screens · 6s · yes · ease-in-out · minimal · Lottie |
| ANIM-005 | Character idle | rest→rest · subtle breathe/blink · 3–4s · **yes** · ease-in-out · none · yes · Lottie/sprite · cap on-screen count |
| ANIM-006 | Character thinking | idle→ponder · hand-to-chin + thought dots · 1.2s in, dots loop · loop dots · ease-out · dots · yes · Lottie |
| ANIM-007 | Card dealing | deck→seat · card slides+slight flip to slot · 220ms/card, staggered 60ms · no · ease-out (0.4,0,0.2,1) · none · yes · Lottie/sprite · batch, GPU transform |
| ANIM-008 | Card flipping | back→face · 3D Y-flip · 260ms · no · ease-in-out · none · yes · Lottie · cheap transform |
| ANIM-009 | Community-card reveal | slot→face · flip + soft glow pulse · 300ms, stagger 120ms (flop together) · no · ease-out · subtle glow · yes · Lottie |
| ANIM-010 | Chip betting | hand/seat→bet pad · chips arc out + settle · 280ms · no · ease-out · dust ≤6 · yes · Lottie/sprite · pool |
| ANIM-011 | Chip stacking | scattered→neat stack · snap stack w/ tiny bounce · 240ms · no · overshoot small · none · yes · Lottie |
| ANIM-012 | Chips into pot | bet pads→center · converge + merge into pile · 360ms · no · ease-in-out · none · yes · Lottie/sprite |
| ANIM-013 | Pot to winner | pot→winner seat · sweep + trail + count-up · 700ms · no · ease-out · sparkle trail ≤24 · yes · Lottie · main celebratory |
| ANIM-014 | Check feedback | tap→ripple · knuckle-tap ripple on seat · 200ms · no · ease-out · ripple · yes · Lottie · tiny |
| ANIM-015 | Call/Raise/Fold feedback | button→confirm · chip pulse (call/raise) / cards-muck slide (fold) · 240ms · no · ease-out · minimal · yes · Lottie · set of 3 |
| ANIM-016 | All-in feedback | shove→flash · chips burst forward + emerald ring flash + "ALL-IN" pop · 600ms · no · overshoot · burst ≤40 · yes · Lottie+sprite · flagship, cap particles |
| ANIM-017 | Winning-card highlight | face→glow · gold-emerald pulse + slight scale · 800ms · **loop while shown** · ease-in-out · soft glow · yes · Lottie |
| ANIM-018 | Turn-timer countdown | full→empty ring · deplete + color emerald→amber→danger + last-3s pulse · = turn length · once · linear (pulse ease) · none · yes · Lottie · very cheap |
| ANIM-019 | Active-player glow | off→on · emerald ring breathe + seat lift · 1s · **loop while active** · ease-in-out · glow · yes · Lottie |
| ANIM-020 | Winning-hand reveal | hidden→shown · cards raise + label banner in (text external) · 600ms · no · ease-out · sparkle · yes · Lottie |
| ANIM-021 | Showdown sequence | reveal→compare→win · sequential flips + highlight winner · 1.2–2s composite · no · staged ease-out · moderate · yes · Lottie · orchestrated |
| ANIM-022 | Victory celebration | win→celebrate · winner scale + emerald-gold burst + character celebratory pose · 1200ms · no · overshoot · confetti ≤80 · yes · Lottie+sprite · cap on phones |
| ANIM-023 | Confetti | burst→fall · emitter fountain, gravity fall+fade · 1500ms · optional short loop · ease-out+linear fall · 60–80 pieces (phone cap) · yes · sprite-sheet/WebM-alpha · pooled, reduce on low tier |
| ANIM-024 | Trophy reveal | hidden→present · trophy rise + shine sweep · 900ms · no · overshoot · gold sparkle ≤20 · yes · Lottie |
| ANIM-025 | Achievement unlocked | off→toast · badge pop + shine + toast slide-in · 700ms · no · overshoot · spark · yes · Lottie |
| ANIM-026 | Rank advancement | old→new rank · emblem morph/level-up beam + count · 1000ms · no · ease-out · beam+spark · yes · Lottie |
| ANIM-027 | Daily reward opening | closed→reward · gift shake→open→reward pop · 900ms · no · overshoot · burst ≤30 · yes · Lottie |
| ANIM-028 | Reward-chest opening | closed→open · lid burst + light shafts + item rise · 1100ms · no · overshoot · light+spark ≤40 · yes · Lottie+sprite |
| ANIM-029 | Tournament countdown | 3→2→1→GO · number pop each second + final flash · 4s · no · overshoot per digit · flash · yes · Lottie |
| ANIM-030 | Table transition | screen A→B · felt wipe / card-shuffle transition · 400ms · no · ease-in-out · none · full-screen · Lottie/shader · keep short |
| ANIM-031 | Connection lost | online→offline · signal drop + calm overlay pulse · 500ms in, subtle loop · loop subtle · ease-out · none · yes · Lottie · non-alarming |
| ANIM-032 | Reconnection | offline→online · spinner→check + settle · 600ms · no · ease-out · none · yes · Lottie |
| ANIM-033 | Success feedback | trigger→check · check-circle draw + soft pulse · 400ms · no · ease-out · tiny spark · yes · Lottie |
| ANIM-034 | Warning feedback | trigger→warn · triangle-! shake · 350ms · no · ease-out · none · yes · Lottie |
| ANIM-035 | Error feedback | trigger→error · circle-! shake + red pulse · 350ms · no · ease-out · none · yes · Lottie |

- **Global perf:** prefer transform/opacity only; no per-frame layout; pre-bake heavy particles to sprite/WebM; expose a quality tier (High/Balanced/Battery) that scales particle counts and disables ambient loops. **Reduced-motion:** each animation has a defined static end-state asset.

---
## 15. Category 11 — Tutorials and empty states

*Inherits Tutorial/Empty master §4.K. All text is external (localization). Warm, encouraging, never discouraging. SVG/WebP transparent; dealer-host (CHR-002) may guide tutorials.*

### Tutorials (TUT-001…005)
| ID | Asset | Prompt delta |
|---|---|---|
| TUT-001 | Poker rules introduction | friendly overview scene w/ dealer-host gesturing to a simplified table; concept slots for steps |
| TUT-002 | Hand-ranking chart | clean chart of the 10 hand ranks using CARD assets (high card→royal flush), ordered, iconographic, caption zones external |
| TUT-003 | Betting-action tutorial | diagram of check/call/bet/raise/fold/all-in with IC-050..055 + chip motion arrows |
| TUT-004 | Table-navigation tutorial | annotated table pointing to seats, pot, community area, controls (labels external) |
| TUT-005 | First-game guidance | step spotlight/coach-mark art (highlight ring + pointer) for guided first hand |

### Empty & system states (EMPTY-001…011)
| ID | Asset | Prompt delta | Tone |
|---|---|---|---|
| EMPTY-001 | No available tables | calm scene, empty table + "start one" motif | encouraging |
| EMPTY-002 | No tournament registrations | empty bracket + clock motif | encouraging |
| EMPTY-003 | No friends online | friendly single character waving / invite motif | warm |
| EMPTY-004 | No achievements yet | dim badge shelf awaiting first unlock | motivating |
| EMPTY-005 | No rewards | empty chest w/ "come back" motif | positive |
| EMPTY-006 | Search — no results | magnifier + gentle "nothing found" motif | neutral-helpful |
| EMPTY-007 | Network error | offline-cloud/signal motif + retry affordance zone | reassuring |
| EMPTY-008 | Server maintenance | friendly wrench/dealer-on-break motif | calm |
| EMPTY-009 | Account restriction | shield/pause motif, supportive not punitive | respectful |
| EMPTY-010 | Responsible-play reminder | calm supportive motif (clock/balance/heart), links to tools | caring, non-judgmental |
| EMPTY-011 | Generic error / 404 | lost-card motif, light humor, recovery affordance | light |

- **Consistency:** shared illustration language + single accent each; pair with ANIM-031/032/034/035 where relevant. **Accessibility:** meaningful `alt` keys; never rely on illustration alone to convey the action (button + text always present).

---
## 16. Category 12 — Marketing and store materials

*Inherits Marketing master §4.L. MANDATE: honest representation; **no real-money / jackpot / "win cash" claims**; include a discreet "Play-money · No cash value" mark and (where required) responsible-play note. Layered masters (Figma/PSD); copy on editable layers for localization; device frames original/generic.*

| ID | Asset | Prompt delta | Spec |
|---|---|---|---|
| MKT-001 | App Store screenshots | hero shots of real screens (lobby, table, showdown, rewards) w/ short benefit captions (external) | iOS 1290×2796 (6.7") + 1242×2208 sets; 6–8 frames |
| MKT-002 | Google Play screenshots | same set for Play | phone 1080×1920+, 7"/10" tablet; feature graphic separate |
| MKT-003 | Website hero artwork | cinematic key art: characters mid-game at emerald table, headline space | 2560×1440 + responsive crops |
| MKT-004 | Promotional banners | modular banner system (leaderboard 728×90, MPU 300×250, wide 970×250, mobile 320×100) | HTML5/static, layered |
| MKT-005 | Tournament banners | energetic arena key art + tournament framing (details external) | in-app 1200×480 + social crops |
| MKT-006 | New-player campaign | welcoming "start playing free" art, welcome-reward motif (play chips) | app + social + web set |
| MKT-007 | Seasonal promo templates | reskinnable template (holiday/season accents over brand) | template kit, 4 seasons |
| MKT-008 | Social-media advertisements | scroll-stopping square/vertical ad art, character + table + hook zone | 1080² + 1080×1920 + 1200×628 |
| MKT-009 | Email-banner artwork | header banners for lifecycle emails (welcome, reward, comeback) | 600×200 + retina |
| MKT-010 | Press-kit images | clean logo pack, key art, character renders, screenshot pack, fact sheet bg | hi-res PNG/PDF bundle |
| MKT-011 | Feature showcase graphics | per-feature spotlight cards (bots, private tables, tournaments, avatars) | 1200×800 set |
| MKT-012 | Store icon / feature graphic | BRD-006 + BRD-013 tie-in for store headers | Play 1024×500, iOS assets |

- **Consistency:** same cast (CHR), same palette, same tone across every channel; every piece carries brand mark + play-money disclaimer where the platform/region requires.

---
## 17. Completeness verification

### 17.1 Screen-by-screen asset checklist

| Screen / Feature | Required assets (IDs) |
|---|---|
| Splash / cold-start | BRD-006/008, ENV-011, ANIM-001/003 |
| Loading | BRD-009, ENV-011, IC-060, ANIM-002/003 |
| Guest / Register / Login | BRD-001, ENV-002/012, BTN-001/002/018-022, IC-014/020/021/022/023, TUT-001 |
| Onboarding | CHR-002, TUT-001…005, BTN-001, ANIM-006 |
| Main lobby | ENV-001, BRD-003, IC-001…013/019/030/031/032, BTN-011/012, CHIP-014/070, ANIM-004 |
| Table selection | ENV-001, IC-004/006/031/032, BTN-011, TBL thumbnails, EMPTY-001 |
| Profile | ENV-012, CHR-023/021/022/025, RWD-004/005/006/008, IC-008/038/047, BTN-002 |
| Avatar / character select | CHR-003…020/025, CHR-021/022, BTN-009/010, IC-069 |
| Gameplay table | TBL-001…024, CARD-000…066, CHIP-000…013, BTN-003…008/016/017/026, IC-050…070, EMO-001…015, ANIM-005…021, BTN-028/029 |
| Showdown / win | CARD-060, TBL-020, ANIM-013/020/021/022/023, CHR expr/pose, RWD-006 |
| Single-player vs bots | CHR-015…019, gameplay set (as above) |
| Multiplayer / public / private | TBL set, IC-006/007/028/029, BTN-012/013/014, ENV-007 |
| Tournaments | ENV-006, IC-005, MKT-005, RWD-003, ANIM-029, EMPTY-002 |
| Rankings | ENV-013, IC-009, RWD-005/006, CHR-022, ANIM-026 |
| Achievements | ENV-014, IC-010, RWD-008, ANIM-025, EMPTY-004 |
| Rewards / daily / chest | ENV-014, IC-011, RWD-001/002/009/010/011/012/013, ANIM-027/028, EMPTY-005 |
| Store (virtual chips) | IC-012, CHIP-001…009/014, BTN-001/017, RWD-003 |
| Friends / social | IC-007/025/026/027/028/029, EMO set, EMPTY-003 |
| Settings | ENV-015, IC-013…024/046, BTN-018…022 |
| Help / Info / Responsible-play | ENV-015, IC-014/015/024, TUT-002/003, EMPTY-010 |
| Errors / offline / maintenance | ENV-016/017, EMPTY-006…011, IC-057…063, ANIM-031/032/034/035 |
| Marketing / store listing | MKT-001…012, BRD-011/012/013 |

### 17.2 Asset-to-screen mapping (family → primary screens)
- **BRD** → splash, loading, headers, stores, marketing.
- **CHR** → profile, avatar select, tables, tutorials, marketing, bots (single-player).
- **ENV** → every screen (background layer).
- **TBL** → all gameplay screens.
- **CARD** → gameplay, showdown, tutorial (hand-rank chart).
- **CHIP/RWD** → gameplay, pot, store, rewards, profile, rankings.
- **IC** → global (nav, HUD, settings, status).
- **BTN** → global (all interactive screens; action set on table).
- **EMO** → tables, social.
- **ANIM** → splash, lobby, gameplay, rewards, errors.
- **TUT/EMPTY** → onboarding, help, and every list/error state.
- **MKT** → external channels + store listings.

### 17.3 Static assets (no motion)
BRD-001…007/010…013; all CHR portraits/full-body/thumbnails/frames/silhouettes; ENV-001…017 (base plates); TBL-001…024 (bases + static markers); **all CARD** (faces, backs, states as static overlays); **all CHIP/RWD** static; **all IC** (except spinner base); **all BTN** static states; EMO static frames; TUT-001…005; EMPTY-001…011; MKT-001…012.

### 17.4 Animated assets
ANIM-001…035; EMO animated variants EMO-001…015; IC-060 (spinner); BTN-025/026 (progress/timer); ENV ambient layers ENV-001/006/011; CARD state ANIM-008/009/017; RWD chest/daily ANIM-027/028; BRD-008/009 ambient.

### 17.5 Transparent-background assets
All **IC**, **BTN** components, **CARD** states & overlays, **CHIP/RWD**, **TBL** markers/indicators/rails, **CHR** (all cutouts), **EMO**, **ANIM** (all except full-screen ENV transitions), BRD-002/003/005/007/010(overlay)/011, TUT/EMPTY spot art. (Opaque: ENV backgrounds, BRD-006 app icon, BRD-008/009 splash/loading, TBL felt bases, MKT full-bleed frames.)

### 17.6 Required responsive variants
- **Backgrounds (ENV, BRD-008/009):** phone 9:19.5, tablet 4:3, desktop 16:9.
- **Table (TBL-001):** 2-max / 6-max / 9-max layouts; phone-portrait, phone-landscape, tablet, desktop framings.
- **Icons:** 20 / 24 / 32 + @1x/2x/3x.
- **Raster (CHR/CHIP/CARD/RWD/EMO):** @1x/2x/3x.
- **Buttons/controls:** height tiers sm36/md44/lg52; table action ≥56 touch.
- **Marketing:** per-platform sizes listed in §16.
- **Layouts:** mobile / tablet / desktop for every composed screen.

### 17.7 Localization-sensitive assets
- Any asset where **text is external** (must support LTR/RTL + long strings): BTN labels, TBL-014/015/017 (SB/BB/ALL-IN), TUT-001…005 captions, EMPTY-001…011, MKT-001…012 copy, IC-020 language, RWD tickets/streak counts, toast/tooltip text.
- **RTL mirroring required:** directional icons (IC-034 back, IC-048 logout, IC-029 share, arrows), slider (BTN-016), progress (BTN-025), tab underlines, layout containers.
- **Numeral/format locale:** chip/pot/timer readouts (tabular figures), dates, ordinals.
- **Culture-neutral art:** CHR cast, EMO (already gesture-safe), MKT (avoid region-locked motifs).

### 17.8 Accessibility variants
- **Four-color deck** (CARD-001…055) toggle.
- **High-contrast theme** variants for CARD faces, TBL markers, BTN focus, IC active.
- **Reduced-motion** static end-state for every ANIM + EMO.
- **Color-independent state** encodings (icon+shape+label) for TBL-009/018/019/020/023, IC-057…063, RWD locked/claimed, BTN states.
- **Large-index card** option; **large-touch** control tier.
- **Screen-reader label keys** for all meaningful imagery (CHR, EMO, RWD, EMPTY, status icons).

### 17.9 Production-priority classification
- **MVP required:** BRD-001…009/013; CHR-000/001/002 + CHR-003…010 (subset of roster) + CHR-015…019 (bots) + expr/pose subset + CHR-020/025; ENV-001/002/011/012/015/016/017; TBL-001/006/007/009…024; CARD-000…066 (full deck + back + states) both color modes; CHIP-000…014 + RWD-001/003/004/006/008/009/011/012; **all IC-001…070**; BTN-001…029; EMO-001…008 (core set); ANIM-001/002/007/008/009/010/012/013/016/017/018/019/020/022/023/030/031/032/033/034/035; TUT-001…004; EMPTY-001…011; MKT-001/002/012.
- **Recommended:** CHR-011…014 (remaining roster) + CHR-021/022/023/024; ENV-003/004/005/006/007/013/014; TBL-002…005 (extra themes); CARD themed backs; RWD-002/005/007/010/013; EMO-009…015; ANIM-004/005/006/011/014/015/021/024/025/026/027/028/029; TUT-005; MKT-003/004/005/006/008/009/011.
- **Future:** ENV-008/009/010; extra table themes/seasonal card backs; MKT-007/010; advanced avatar tiers; extended emote packs; seasonal ANIM variants.

### 17.10 Final coverage audit

Every element named in the brief maps to at least one prompted asset:

- **Brand identity (12 items)** → BRD-001…013 ✔ (logo, wordmark, symbol, light/dark, mono, app icon, favicon, splash, loading, patterns, social profile+cover, store graphics).
- **Characters/avatars (all listed)** → CHR-000…025 incl. male/female/neutral, diverse ages/ethnicities/styles, beginner→high-level archetypes, dealer/host, 5 bots, default anon, locked silhouette, portraits, full-body, 6-expression set, 6-pose set (idle/thinking/betting/winning/losing/all-in), premium frames, rank borders, selection thumbnails ✔.
- **Environments (17 items)** → ENV-001…017 (all listed rooms + loading/profile/rankings/rewards/settings + empty + maintenance/error) ✔.
- **Tables & gameplay materials (all listed)** → TBL-001…024 (table designs, felt, rails, dealer marker, seats, empty seat, community area, pot, betting zones, table sign, SB/BB, dealer button, all-in, turn, active, winner, side-pot, spectator, connection) ✔ + multiple themes.
- **Playing cards (all listed)** → CARD-000…066 (full 52, back, 4 suits, numbers, J/Q/K, ace, joker decorative, face-up/down, selected, winning, dimmed, shadows, placeholder, deck-stack, tutorial) ✔ + two- & four-color.
- **Chips/currencies/rewards (all listed)** → CHIP-001…014 + RWD-001…013 (denoms, single, stacks, piles, tray, pot, currency symbol, daily, login, ticket, XP, RP, trophy, medal, badge, chest, gift, locked, claimed, bonus) ✔.
- **Interface icons (all listed + status/nav/system/gameplay)** → IC-001…070 ✔ (every named icon + connection/status/feedback/gameplay actions).
- **Buttons/controls (all listed + all states)** → BTN-001…029 with default/hover/pressed/focused/disabled/loading/selected ✔ (incl. check/call/bet/raise/fold/all-in, join/create/sit/leave, slider, chip selector, toggles, checkbox, radio, tabs, dropdown, pagination, tooltip, progress, timer, modal, toast).
- **Emotes (15 items)** → EMO-001…015 ✔ (all listed reactions, static + animated).
- **Animations/effects (all listed)** → ANIM-001…035 ✔ each with start/end, movement, duration, loop, fps, easing, particles, transparency, format, mobile perf.
- **Tutorials/empty states (all listed)** → TUT-001…005 + EMPTY-001…011 ✔.
- **Marketing/store (all listed)** → MKT-001…012 ✔.
- **Cross-cutting requirements** → design system §1, consistency §2, naming/files/export §3, responsive §17.6, localization §17.7, accessibility §1.6+§17.8, priority §17.9 — all defined ✔.

**Audit result: COMPLETE.** Every character, environment, icon, card, chip, control, illustration, effect, animation, tutorial image, empty state, and promotional asset in the brief has an assigned production prompt (directly or via a family master + delta), with consistency, export, responsive, localization, and accessibility rules specified. Only work remaining is executing generation against these prompts and the one-time foundation sheets (CHR-000, CARD-000, CHIP-000, TBL-001 seat map) that lock cross-asset consistency.

---

*End of MERIDIAN POKER Visual Asset Production Prompt Book.*















