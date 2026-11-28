# Deploy REELAY (permanent hosting)

The app needs exactly **one** environment variable: `DATABASE_URL`.
Everything else — Telegram token, Zernio key, account ids — is stored in the
database and linked from the web UI, so it never needs to go into a config
file or a git repo.

Two things are required for it to stay up:

1. **An always-on host** for one Node process. Railway, Fly.io, or a VPS.
   Avoid serverless (Vercel, Netlify functions) — cold starts would pause the
   scheduler and the Telegram long-poll.
2. **A persistent Postgres** — Neon (free), Supabase, or the host's own.

---

## Fastest path — Railway (recommended)

Railway does not sleep free services, so the scheduler keeps ticking.

### From a computer

```bash
git init && git add -A && git commit -m "REELAY"
git remote add origin https://github.com/<you>/reelay.git
git push -u origin main
```

Then:

1. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo** → pick `reelay`.
   Railway reads `railway.json` (build + start + restart-on-crash) automatically.
2. In the same project: **New** → **Database** → **Postgres**.
3. Open your web service → **Variables** → add
   `DATABASE_URL` = the Postgres connection string Railway shows
   (**Reference** → `DATABASE_URL` also works).
4. Deploy → open the public URL.
5. Open **/bot** and **/ig** in the deployed app and re-link your two tokens
   (30 seconds — they live in the database, so a new database starts empty).

### From a phone

1. Download the source: open your current REELAY URL + **`/api/deploy-kit`** —
   it gives you a `reelay-source.tar.gz` with everything except secrets.
2. Create a repo at github.com/new on your phone's browser, then
   **Add file → Upload files** and upload the extracted files.
3. Continue with the Railway steps above.

---

## Alternative — Render

Fork the repo, then create a **Blueprint** — `render.yaml` provisions the web
service and a Postgres instance with `DATABASE_URL` already wired.

> ⚠️ Free Render web services **sleep after 15 minutes idle**, which pauses the
> scheduler and the bot. Use a paid plan, or add an uptime monitor pinging
> `/api/health` every 5 minutes.

## Alternative — Docker / a VPS

```bash
docker build -t reelay .
docker run -d --name reelay -p 3000:3000 \
  -e DATABASE_URL="postgresql://..." \
  -v reelay_media:/app/.media -v reelay_uploads:/app/.uploads \
  --restart unless-stopped reelay
```

The volumes keep downloaded videos and uploaded covers across restarts.

---

## After deploying

| | |
|---|---|
| `npx drizzle-kit push` | creates the `videos` + `settings` tables (run once against the new database) |
| `/bot` | re-link the Telegram token |
| `/ig` | re-link the Zernio key — REELAY refreshes the account id automatically |
| `/api/health` | health check for uptime monitors |
| `/posted` → **Clear history** | wipes the old test posts from a fresh start |

## Why your posts survive a restart

- The scheduler claims any post whose air time has passed, so nothing is lost
  if the process is briefly down — it just publishes late.
- Publishing hands the video bytes to Zernio, so Instagram never fetches from
  your host; a restart cannot break a post.
- If a restart wipes local media, REELAY re-downloads it from the TikTok link
  before publishing.

## Environment variables

Set these in the host's dashboard. **Names only — never commit values.**

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string |
| `RESEND_API_KEY` | for sign-in | Resend key that emails one-time codes |
| `EMAIL_FROM` | no | Verified sender for those codes |
| `PUBLIC_BASE_URL` | no | Public origin; auto-detected from the browser if unset |
| `ZERNIO_API_KEY` / `ZERNIO_ACCOUNT_ID` | no | can be linked in `/ig` instead |
| `TELEGRAM_BOT_TOKEN` | no | can be linked in `/bot` instead |
| `IG_ACCESS_TOKEN` / `IG_BUSINESS_ACCOUNT_ID` | no | Graph API alternative to Zernio |
| `SCHEDULER_INTERVAL_MS` | no | scheduler tick, default `15000` |

## Fixing `ON CONFLICT ("email")` on OTP inserts

If sign-in fails with an error mentioning `otps` or `ON CONFLICT`, the table on
**that** database is missing or lacks a unique key on `email`.

```bash
DATABASE_URL="your-connection-string" node scripts/fix-otps.mjs
```

The script inspects the live schema first and:

- creates `otps` with `CREATE TABLE IF NOT EXISTS` if it is absent
- checks every column name and type against what the app expects
- **refuses to add a uniqueness constraint while duplicate emails exist** — it
  lists them (masked) instead of deleting anything
- adds `PRIMARY KEY (email)` only when there are no duplicates
- is idempotent, and never prints the connection string

At runtime the app performs the same check before inserting and returns this
message instead of a raw PostgreSQL error:

> The otps table has no PRIMARY KEY or unique index on "email", so
> ON CONFLICT ("email") cannot work. Run: node scripts/fix-otps.mjs

If the upsert still fails, the app logs the PostgreSQL error code and message
(credentials redacted) under the `[otp]` prefix and falls back to an
update-then-insert so sign-in keeps working.
