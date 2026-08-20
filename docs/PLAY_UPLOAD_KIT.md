# Play Console Upload Kit — CAPA CONTEST

Everything needed to upload the app to **internal testing** and get André's tester link.
Whoever is logged into Play Console (mastercred962@gmail.com) follows this top to bottom.

---

## ⚠️ READ FIRST — Real-money gambling policy (the real gate)
CAPA CONTEST charges real entry fees (Pix/card) for cash-prize tournaments → Google
treats this as a **Real-Money Gambling (RMG)** app. Google Play allows RMG apps in Brazil,
but **only after the developer applies and is approved** (licensing + an application form),
and the app must declare it.

- **Internal testing** track usually installs without full RMG review, so you can test the
  build now. **Production release will be blocked until the RMG application is approved.**
- Start the RMG application early: Play Console → **Policy → App content → Real-money
  gambling, games, contests** → complete the declaration/application for **Brazil**.
- This is a legal/licensing step (needs the company's gambling authorization). Loop in
  André — it's the long pole for public launch, not the build.

If you prefer to avoid RMG review for the first testable version, the alternative is to
ship the test with **play-money only** and add real entries after approval — a product
decision for you + André.

---

## Files & facts (copy as needed)
| Field | Value |
|---|---|
| App bundle (AAB) | `mobile/build/app/outputs/bundle/release/app-release.aab` |
| Package name | `com.capacontest.capa_contest` |
| Version | `1.0.0` (versionCode 1) |
| Privacy policy URL | `https://capa-contest-api.onrender.com/legal/privacidade` |
| Terms URL | `https://capa-contest-api.onrender.com/legal/termos` |
| Tournament rules URL | `https://capa-contest-api.onrender.com/legal/regulamento` |
| Support email | mastercred962@gmail.com (or André's preferred) |
| Company | ANDRE LUIZ LABADESSA LTDA — CNPJ 67.550.569/0001-00 |

## Step 0 (recommended) — fix the app display name
Currently the launcher shows `capa_contest`. Ask Claude to change `android:label` to
**"CAPA CONTEST"** and rebuild the AAB (1 min) before uploading. Optional but looks far
more professional to André.

## Step 1 — Create the app
Play Console → **Create app**.
- App name: **CAPA CONTEST**
- Default language: **Portuguese (Brazil) – pt-BR**
- App or game: **Game**
- Free or paid: **Free** (money moves via in-app entries, not an upfront price)
- Accept the declarations → **Create app**.

## Step 2 — Internal testing release
Testing → **Internal testing** → **Create new release**.
- Play App Signing: **accept** (Google manages the app signing key; your upload key
  from `android/upload-keystore.jks` stays the upload key — keep it backed up).
- Upload `app-release.aab`.
- Release name: `1.0.0 (1)`
- Release notes (pt-BR):
  ```
  Primeira versão de teste do CAPA CONTEST: torneios de múltiplas mesas,
  entrada por Pix/cartão, 1000 fichas por competidor.
  ```
- **Save** (don't roll out yet — finish the declarations below first).

## Step 3 — App content declarations (Policy → App content)
Fill each section:
- **Privacy policy:** paste the privacy URL above.
- **Ads:** No ads (unless you add them).
- **App access:** login requires SMS OTP → provide test instructions (see Step 5).
- **Content rating:** start the IARC questionnaire → category **Game**; answer the
  **gambling** questions truthfully (real-money contests = Yes). Expect an adult rating.
- **Target audience:** **18+** (real-money → adults only).
- **Data safety:** declare what's collected — **phone number** (account), **CPF**
  (identity/age check), **financial info** (payments via InfinitePay), device identifiers.
  Data is encrypted in transit; users can request deletion (contact = support email).
- **Real-money gambling:** complete per the RED box at the top.

## Step 4 — Testers
Internal testing → **Testers** → create/pick an email list → add André's Google email
(+ your own). Save. Copy the **"Copy link"** join URL.

## Step 5 — Login codes for testers (WhatsApp OTP)
- Login codes are delivered over **WhatsApp** (Meta Cloud API). Once the WhatsApp Business
  number + approved authentication template are connected and `OTP_PROVIDER=whatsapp` is set
  on Render, testers get the code automatically in WhatsApp — nothing to do.
- Until that's live: codes are in the server log. Claude can read a tester's code from the
  Render logs and relay it, or use the admin OTP-relay endpoint. Note this in **App access**
  instructions so Google's reviewer can log in (give a test phone + how the code is obtained).

## Step 6 — Roll out
Review the release → **Start rollout to Internal testing** → confirm.
Send André the tester link (Step 4). He opens it on his phone → "Become a tester" →
installs from Play. Done.

---

### After the test → toward production
1. RMG application approved (Step 0 red box).
2. Automatic login-code delivery for production reviewers/users (WhatsApp or Twilio);
   until then the no-cost admin relay covers internal testing.
3. Render Postgres upgraded to paid (free DB is **deleted ~30 days after creation** —
   created 2026-08-08, so ~2026-09-07; upgrade before then or lose the data).
4. Closed testing (Google requires 14 days / 12+ testers for new personal accounts before
   production) — start this early if launching publicly soon.

---

## Paste-ready store listing (pt-BR)

**Short description** (máx. 80 caracteres):
```
Torneios de pôquer multimesas. Entre, jogue e dispute prêmios em dinheiro.
```

**Full description** (máx. 4000 caracteres):
```
CAPA CONTEST é a plataforma de torneios de pôquer em várias mesas. Entre em um
torneio, sente na mesa mais cheia e jogue rumo ao título — o vencedor de cada mesa
avança até restar um único campeão.

COMO FUNCIONA
- Torneios multimesas (shootout): vença sua mesa e avance para a próxima.
- Cada competidor começa com 1000 fichas, independentemente do valor de entrada.
- A aposta mínima começa em 50 fichas e dobra a cada 3 rodadas, deixando o jogo
  cada vez mais intenso.
- Entrada por Pix ou cartão, com valores sempre visíveis antes de confirmar.
- Assinatura opcional com benefícios na participação e nos prêmios.

JOGO DE HABILIDADE
O pôquer é um jogo de habilidade: leitura, estratégia e gestão de fichas decidem o
campeão. Jogue com responsabilidade. Conteúdo destinado a maiores de 18 anos.

Política de Privacidade, Termos de Uso e Regulamento dos Torneios disponíveis no
aplicativo e no site.
```
*(Adjust framing to match the final real-money vs skill-game positioning you and André settle on.)*

## App access — how Google's reviewer logs in
The app requires a login code. For **internal testing** the code is delivered via the
no-cost admin relay (developer reads it and provides it). Before the **production**
submission, add a reviewer test login (a fixed test phone + code, env-gated) so Google's
reviewer can sign in without SMS, and fill the **App access** section with:
- Test phone number: (a dedicated test number, not a real user)
- How to receive the code: provided by developer / fixed review code
- Any other steps to reach the paid-entry and tournament screens.

## Data Safety — exact answers (Play Console → App content → Data safety)
- Does your app collect or share any user data? **Yes.**
- Is all data encrypted in transit? **Yes.**
- Do you provide a way to request data deletion? **Yes** — via the support email.
- Data types collected:
  | Type | Collected | Shared | Purpose | Required |
  |---|---|---|---|---|
  | Name (display name) | Yes | No | Account management | Yes |
  | Phone number | Yes | No | Account management, login | Yes |
  | Other IDs (CPF) | Yes | No | Identity / age verification, fraud prevention | Yes |
  | Financial info (payment info / purchase history) | Yes | Yes* | Process tournament entries/subscriptions | Yes |
  | App activity (in-app actions) | Yes | No | App functionality (gameplay) | Yes |

  *Financial data is handled by the payment provider (InfinitePay). Declare sharing with
  the processor; the app itself does not store full card data.

## Content Rating — exact answers (Play Console → App content → Content rating → IARC)
- Category: **Game**. Email: the support email.
- Gambling: **Yes** — "the app allows users to gamble/bet real money and win real
  money or prizes." (This is the key answer; it drives an adults-only rating.)
- Violence, sexual content, controlled substances, hate, profanity: **No** to all.
- Result: expect an **18+ / adults-only** rating — consistent with the Target audience
  (18+) and the real-money declaration. Answer truthfully; misdeclaring risks removal.

## Closed-test tester list (start collecting NOW)
Production for a new personal account needs **12+ testers opted in for 14 continuous
days**. Collect 12 Google (Gmail) addresses now — friends, André's contacts, staff — so
the closed test can start the day the account clears. Keep the list here:
```
1. …@gmail.com
2. …
(12 total)
```
