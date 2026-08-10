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
2. Twilio upgraded to paid (trial only texts verified numbers).
3. Render Postgres upgraded to paid (free DB is deleted after 30 days).
4. Closed testing (Google requires 14 days / 12+ testers for new personal accounts before
   production) — start this early if launching publicly soon.
