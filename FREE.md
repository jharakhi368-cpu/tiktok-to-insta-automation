# Run REELAY free — no credit card

You are 17 and have no card, so this is built around one honest fact:

> **No free tier runs a Node app 24/7.** Free hosts sleep when nobody is
> visiting (Render after 15 minutes, ~60 s to wake). Anyone offering
> "always-on free" asks for a card for verification first — Koyeb, Fly.io,
> Northflank all do.

So instead of pretending otherwise, REELAY is built to **work while the host
sleeps**, and a free monitor keeps it awake. Everything below is $0 and needs
no payment details.

## The stack

| Piece | Service | Why | Card? |
|---|---|---|---|
| Code | **GitHub** | Private repos, free | No |
| App | **Render** | Real Node server, deploys from GitHub,750 hrs/mo | No |
| Database | **Neon** (or Supabase) | Postgres that does *not* expire in30 days | No |
| Wake-up + scheduler | **UptimeRobot** | Pings every5 min → wakes the app *and* runs the scheduler | No |

> Render's own free Postgres expires after about30 days — that would silently
> wipe your schedule. Use **Neon** instead; it suspends when idle and resumes
> in under a second on the next connection.

## Setup (about20 minutes, works on a phone)

###1. Put the code on GitHub
Download it from **`/api/deploy-kit`** on your current REELAY URL, then
create a repo at github.com/new → **Add file → Upload files**.

###2. Create the database at neon.tech
Sign up with GitHub (no card) → create a project → copy the connection
string. It looks like `postgresql://user:pass@ep-xxx.aws.neon.tech/db`.

###3. Deploy on render.com
1. Sign up with GitHub (no card).
2. **New → Web Service → connect your repo.**
3. Build command `npm ci && npm run build`, start command `npm run start`.
   (Render reads `render.yaml` from the repo and fills these in.)
4. Add the env var `DATABASE_URL` = your Neon string.
5. Deploy, open the URL it gives you.

###4. Create the tables
```bash
DATABASE_URL="your-neon-string" npx drizzle-kit push
```
Or run it once from any machine that has the repo.

###5. Link your tokens (30 seconds each)
Open your new URL → **/bot** → paste the Telegram token → **Connect**.
Open **/ig** → paste the Zernio key → **Connect**. They are stored in the
database, so they never go in a config file or a git repo.

###6. Keep it awake — UptimeRobot

> **Use `/api/health`, not `/api/tick`.** `/api/tick` runs the scheduler
> inline — it does real publishing work and can take a long time, so a monitor
> pointing at it reports **DOWN** while the app is healthy. `/api/health` is a
> fast `select 1` and is the correct liveness check. Any request still wakes
> the service, and the scheduler runs on its own in-process interval.

Sign up (no card) → **Add monitor**:
- Type: `HTTP(s)`
- URL: `https://your-app.onrender.com/api/health`
- Interval: **5 minutes**

Every ping wakes the service **and** runs the scheduler, so due posts go out
even if you never open the dashboard. Render gives you750 instance-hours a
month and a continuously-woken service uses about720 — the5-minute ping keeps
it inside that budget with a little room to spare.

###7. Turn the bot into a webhook
**/bot → "Turn on webhook"**. Telegram then *pushes* messages to your app, so
a message from you wakes the host by itself. Without it the bot relies on
long polling, which needs a process that never stops — fine while the monitor
keeps the service awake, but webhook is the resilient option.

## What survives a restart

| | |
|---|---|
| Schedule, captions, covers metadata, both tokens | ✅ in Postgres |
| Downloaded videos | ⚠️ on disk — **re-downloaded automatically** from the TikTok link before publishing |
| Uploaded custom covers | ⚠️ on disk — kept as long as the deploy doesn't wipe `.uploads/` |
| Late posts | ✅ the claim is `scheduled_at <= now`, so a post publishes on the next tick rather than being lost |

## Limits to know

- **Cold start ~60 s.** First visitor after idle waits. UptimeRobot's5-minute
  ping mostly hides this.
- **Not commercial.** Render's free tier and Vercel's Hobby plan are for
  personal/non-commercial use. If this ever earns money, move to a paid plan.
- **Age.** These four don't ask for a card, but always read a platform's
  terms — some hosts (Koyeb, Fly.io, Railway paid, Northflank) set a minimum
  age of18 and require card verification.
- **One bot instance.** Telegram rejects two pollers for the same token, so
  don't run this repo in two places at once with polling on.

## If you later get a card

Railway ($5 trial then ~$1/mo credit) or a $5 VPS with `pm2` gives you a
server that never sleeps — then you can drop UptimeRobot and switch off the
webhook. Nothing in the code needs to change.
