# REELAY — TT → IG relay console

> **Status: deploy-ready.** Drop a TikTok link or send a video to the bot, pick the
> cover frame, write the caption, set an exact air time — REELAY publishes it to
> Instagram as a Reel via Zernio. Runs on Render + Neon + UptimeRobot for $0.

Drop TikTok videos into a Telegram bot, set the cover frame, write the caption,
pick an exact air time, and REELAY pushes them to Instagram as Reels — from a
broadcast-style console, or entirely from Telegram buttons.

```
/            Console    intake rail · cover scrub · caption · custom time set
/queue       Queue      next-on-air countdown, armed log, one-tap arming
/posted      Posted     feed history, faults, live vs simulated counts
/bot         Telegram   link the bot token (stored in Postgres)
/ig          Instagram  link the Graph API token (stored in Postgres)
```

## Run it

```bash
npm install
npx drizzle-kit push     # creates videos + settings tables
npm run dev              # http://localhost:3000
```

Production:

```bash
npm run build && npm run start
```

`DATABASE_URL` is required (see `.env`).

## Link the Telegram bot

1. In Telegram open **@BotFather** → `/newbot` → name it → copy the token.
2. Open **/bot** in the console → paste the token → **Connect**.
   The token is validated with `getMe`, saved to the `settings` table, and the
   long-polling bot starts immediately (and again on every server boot).
3. Send the bot any TikTok video. It replies with buttons:
   `Schedule +1h`, `Tonight 19:00`, `Tmrw 09:00`, `Disarm`, `Next cover`,
   `Set caption`, `Post now`, `Remove` — plus `/start`, `/queue`, `/posted`,
   `/settings`. Every publish is also pushed back into your chat.

## Link Instagram

1. Switch the account to **Professional** (Business or Creator).
2. [developers.facebook.com](https://developers.facebook.com) → **My Apps** →
   Create App → type **Business** → add the **Instagram Graph API** product.
3. [graph.facebook.com/explorer](https://graph.facebook.com/explorer) →
   your user → permissions `instagram_basic`, `instagram_content_publish`,
   `instagram_manage_comments`, `pages_read_engagement` → **Generate Access
   Token**, then exchange it for a long-lived (60-day) token.
4. Open **/ig** → paste the token → **Connect**. The Instagram business account
   id is discovered automatically; paste it manually only if discovery fails.

Without a token every publish resolves as **SIMULATED** and is labelled that way
in the UI and the log — nothing is ever faked as posted.

## Staying up (permanence)

The bot and the scheduler live **inside the server process**, not in your
browser:

- `src/instrumentation.ts` boots the playout scheduler and the Telegram poller
  the moment the server starts (stable in Next 15/16, no config flag).
- The scheduler ticks every 15s (`SCHEDULER_INTERVAL_MS`) and publishes anything
  whose air time has passed — verified with zero requests from any client.
- `/api/tick` also (re)starts the scheduler as a safety net.
- Tokens, handles and chat ids are rows in Postgres, so they survive restarts
  and never need re-entering.
- The status bar shows live `UP` time and the scheduler LED.

To keep it running permanently, put it on a host that keeps one Node process
alive with a Postgres that persists:

| | |
|---|---|
| **App** | Railway, Render, Fly.io, a VPS with `docker compose` / `pm2`, or Vercel (note: serverless cold starts will pause the scheduler — a always-on container is better) |
| **Database** | Neon, Supabase, Railway Postgres, or any managed Postgres — set `DATABASE_URL` |
| **Secrets** | Optional. Tokens are stored in the DB via `/bot` and `/ig`; `TELEGRAM_BOT_TOKEN` / `IG_ACCESS_TOKEN` / `IG_BUSINESS_ACCOUNT_ID` still work as fallbacks |
| **Keep-alive** | One long-lived Node process (`next start` or `node server.js`) — the poller and scheduler need it |

Health check: `GET /api/health`.

## Environment

| Var | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string |
| `SCHEDULER_INTERVAL_MS` | no | scheduler tick, default `15000` |
| `TELEGRAM_BOT_TOKEN` | no | fallback if the bot isn't linked in the UI |
| `IG_ACCESS_TOKEN`, `IG_BUSINESS_ACCOUNT_ID` | no | fallbacks if Instagram isn't linked in the UI |
