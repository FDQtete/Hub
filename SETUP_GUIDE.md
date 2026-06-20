# Services & Connection Guide

Every service the hub needs, what it's for, and exactly how to connect it. The core idea behind the whole setup: **no secret (Canvas token, Anthropic API key) ever lives in the public site's code.** They all live as encrypted secrets inside a Cloudflare Worker, which acts as the only thing allowed to talk to Canvas/Anthropic on the site's behalf.

```
Browser (your phone/iPad/PC)
   |
   |  loads static files (HTML/CSS/JS, manifest.json, evaluaciones.json...)
   v
GitHub Pages  ───────────────────────────────►  (no secrets here, totally public)
   |
   |  app.js calls your Worker's URL for live data
   v
Cloudflare Worker  ───► holds CANVAS_TOKEN, ANTHROPIC_API_KEY as encrypted secrets
   |                     forwards requests to:
   ├──► Canvas API (udp.instructure.com)
   └──► Anthropic API (Jarvis's responses)

Gmail sync + weekly summary → handled separately, see section 5
```

---

## 1. GitHub — hosts the site, stores automation secrets

**What it's for:** GitHub Pages serves the static site for free. GitHub Actions (if you want the weekly-summary workflow to run independently of asking me) needs its own secrets storage.

**Steps:**
1. Create a new **public** repository (free Pages requires public on personal accounts) — e.g. `udp-hub`.
2. Push the contents of your local `udp-hub` folder to it.
3. Repo → **Settings → Pages** → Source: deploy from branch `main`, folder `/ (root)`. GitHub gives you a URL like `vicente.github.io/udp-hub`.
4. If you later add a GitHub Actions workflow that needs a secret directly (not through the Worker): repo → **Settings → Secrets and variables → Actions → New repository secret**.

**Special access needed:** none beyond owning the repo. No billing — public repos get unlimited free Actions minutes.

---

## 2. Cloudflare — the backend proxy that hides your tokens

**What it's for:** a Cloudflare Worker is a small serverless function. It's the only thing that knows your Canvas token and Anthropic key — the browser never sees them.

**Steps:**
1. Sign up free at [dash.cloudflare.com](https://dash.cloudflare.com).
2. On your machine (not mine — I can write the code, but the interactive login needs your browser): install Wrangler, Cloudflare's CLI:
   ```
   npm install -g wrangler
   wrangler login          # opens a browser tab to authorize
   ```
3. Initialize the Worker project (I can write `wrangler.toml` and the Worker code for you — just tell me when you want to do this step and I'll generate the files).
4. Store the secrets — this is the step that matters most:
   ```
   wrangler secret put CANVAS_TOKEN
   wrangler secret put ANTHROPIC_API_KEY
   ```
   Each command prompts you to paste the value; Wrangler encrypts it server-side and **never writes it to disk or to the repo**. [Source](https://developers.cloudflare.com/workers/configuration/secrets/)
5. Deploy:
   ```
   wrangler deploy
   ```
   You get a URL like `udp-hub-proxy.<yourname>.workers.dev`. `app.js` calls this URL instead of calling Canvas/Anthropic directly.

**Special access needed:** none beyond the free account. Just don't ever paste the actual token values into a chat message to me once you're doing this step yourself, and don't commit them to the repo — only `wrangler secret put` should ever see them.

---

## 3. Canvas LMS — you already generated this token

**Already done:** you gave me a token in the format `14869~...` for domain `https://udp.instructure.com`.

**Where it goes now:** as the Worker's `CANVAS_TOKEN` secret (step 2.4 above) — not anywhere in the site's code.

**A few things worth checking on your end:**
- Canvas → Account → Settings → scroll to **Approved Integrations** — confirm the token's expiration date (personal access tokens can be set to never expire, or to a specific date). If it expires, the Canvas panel in the hub will start failing silently until you generate a new one.
- Personal Canvas tokens don't have a granular scope picker (that's an admin-only feature) — yours has the same read/write access as your own student account, which is more than enough but also means it's just as sensitive as your Canvas password. Treat it that way.

---

## 4. Anthropic API — Jarvis's brain

**What it's for:** the actual language model Jarvis calls to answer you. Separate from your claude.ai login — this is a developer account with its own billing.

**Steps:**
1. Go to [console.anthropic.com](https://console.anthropic.com) and sign in or create an account.
2. **Settings → Billing** → add a payment method. It's pay-as-you-go with no monthly minimum — you're billed only for tokens actually used.
3. **Settings → API Keys → Create Key.** Name it something like "Jarvis hub". Anthropic shows you the key **only once** at creation — copy it immediately.
4. That key becomes the Worker's `ANTHROPIC_API_KEY` secret (step 2.4 above).

**Model to use:** `claude-haiku-4-5-20251001` — cheapest tier, plenty capable for a personal assistant.

**Special access needed:** none beyond billing being enabled. [Source](https://pickaxe.co/post/how-to-get-your-claude-api-key-a-step-by-step-guide)

---

## 5. Gmail — already connected, but there are two different setups depending on what you want

**Mode A — what already works today, zero extra setup:** Gmail is connected as a Cowork connector in our chat. When you ask me (in a conversation, or via a Cowork scheduled task) to check your evaluations or build the weekly summary, I call Gmail directly through that connector. This is exactly how `evaluaciones.json` got real data already.

**Mode B — fully unattended, independent of any chat with me:** if you want the weekly summary to run on a server at 7pm every Sunday with nobody opening a conversation, that job needs its *own* way into Gmail, which means:
1. A Google Cloud Console project, with the Gmail API enabled.
2. An OAuth consent screen + OAuth client credentials.
3. A one-time browser authorization to get a refresh token.
4. Storing the client ID/secret/refresh token as GitHub Actions secrets.

This is genuinely more setup than everything else in this guide combined, for something that's mostly cosmetic (running without you, versus running because you asked). **My recommendation: skip Mode B.** Use Cowork's own scheduled-task feature instead (I can set this up with the `schedule` skill) — it runs me, in this same chat-capable form, on a recurring schedule, and I already have Gmail access. No new Google Cloud project needed. Tell me the day/time you want and I'll configure it.

---

## 6. Voice (later, optional) — nothing to sign up for

The Web Speech API (`SpeechRecognition` / `SpeechSynthesis`) is built into Chrome/Edge — no account, no key, no cost. This is the right starting point before considering ElevenLabs or Whisper, which would mean another paid account (see `INFRAESTRUCTURA.md` for those costs if you outgrow the free browser option).

---

## What you do NOT need

- A domain registrar — `github.io` works fine for now.
- A database — the JSON files in `data/` are enough at this scale.
- A separate hosting account for the backend — Cloudflare's free tier covers it.

---

## Quick checklist

| Service | Account needed | Secret to generate | Where it's stored |
|---|---|---|---|
| GitHub | Yes (you likely have one) | none required | n/a — public repo |
| Cloudflare | Yes, free | none for the account itself | `CANVAS_TOKEN`, `ANTHROPIC_API_KEY` as Worker secrets |
| Canvas | Already have the token | Personal Access Token (have it) | Worker secret `CANVAS_TOKEN` |
| Anthropic | Yes, with billing enabled | API key | Worker secret `ANTHROPIC_API_KEY` |
| Gmail | Already connected via Cowork | none — uses existing connector | n/a |

**Next step on my side, whenever you're ready:** I can write the actual Cloudflare Worker code (the proxy that talks to Canvas and Anthropic) and the `wrangler.toml` config right now — that part doesn't need any account from you yet. The only steps that need *you* specifically are the `wrangler login` browser step and pasting secret values into `wrangler secret put` on your own machine, since those are interactive and I shouldn't be the one holding your raw tokens.
