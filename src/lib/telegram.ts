/**
 * Telegram bot intake + control surface.
 *
 * Every feature of REELAY is exposed as an inline button: the operator can
 * schedule, re-cover, caption, publish, queue-list and posted-list straight
 * from the chat. The token is read from the `settings` table first (linked on
 * the /bot page) and falls back to TELEGRAM_BOT_TOKEN.
 */

import { db } from "@/db";
import { videos } from "@/db/schema";
import { KEYS, getSetting, setSetting } from "./settings";
import { ingestTikTokLink, storeCover } from "./tiktok";

const API = "https://api.telegram.org";

type BotState = { token: string; gen: number; handle: string | null; chatId: string | null };

const g = globalThis as typeof globalThis & {
  __reelayBot?: BotState;
  __reelayBotError?: string | null;
};

let generation = 0;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ── token / status ─────────────────────────────────────────── */

export async function resolveToken(): Promise<string | null> {
  const stored = await getSetting(KEYS.tgToken);
  return stored || process.env.TELEGRAM_BOT_TOKEN || null;
}

export function botConfigured() {
  return Boolean(g.__reelayBot || process.env.TELEGRAM_BOT_TOKEN);
}

export function botHandle(): string {
  return g.__reelayBot?.handle ?? process.env.TELEGRAM_BOT_HANDLE ?? "@reelay_bot";
}

export function botPolling() {
  return Boolean(g.__reelayBot);
}

/** last getUpdates failure, surfaced in the console so a dead bot is never silent */
export function botLastError(): string | null {
  return g.__reelayBotError ?? null;
}

async function api<T = any>(method: string, payload?: Record<string, unknown>): Promise<T> {
  const token = g.__reelayBot?.token ?? (await resolveToken());
  if (!token) throw new Error("no bot token");
  const res = await fetch(`${API}/bot${token}/${method}`, {
    method: payload ? "POST" : "GET",
    headers: payload ? { "Content-Type": "application/json" } : undefined,
    body: payload ? JSON.stringify(payload) : undefined,
    cache: "no-store",
  });
  const data = (await res.json()) as { ok: boolean; result?: T; description?: string };
  if (!data.ok) throw new Error(data.description ?? `${method} failed`);
  return data.result as T;
}

/** Validate a token with getMe — used by the /bot linking page. */
export async function verifyToken(token: string): Promise<{ ok: boolean; handle?: string; error?: string }> {
  try {
    const res = await fetch(`${API}/bot${token.trim()}/getMe`, { cache: "no-store" });
    const data = (await res.json()) as { ok: boolean; result?: { username?: string }; description?: string };
    if (!data.ok) return { ok: false, error: data.description ?? "Token rejected by Telegram" };
    return { ok: true, handle: `@${data.result?.username ?? "unknown"}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not reach Telegram" };
  }
}

/* ── lifecycle ──────────────────────────────────────────────── */

/**
 * Webhook mode: Telegram pushes updates to us instead of us polling it.
 * This is what lets the bot work on a free host that sleeps — an incoming
 * message wakes the service. Long polling needs a process that never stops.
 */
async function registerWebhook(url: string, token: string): Promise<boolean> {
  const secret = (await getSetting(KEYS.tgWebhookSecret)) ?? null;
  const withSecret = secret ?? randomSecret();
  if (!secret) await setSetting(KEYS.tgWebhookSecret, withSecret);

  try {
    const res = await fetch(`${API}/bot${token}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, secret_token: withSecret, drop_pending_updates: false }),
      cache: "no-store",
    });
    const data = (await res.json()) as { ok: boolean; description?: string };
    return Boolean(data.ok);
  } catch {
    return false;
  }
}

export async function clearWebhook(): Promise<void> {
  const token = await resolveToken();
  if (!token) return;
  try {
    await fetch(`${API}/bot${token}/deleteWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ drop_pending_updates: false }),
      cache: "no-store",
    });
  } catch {
    /* nothing to clear */
  }
}

/** The secret Telegram must send in X-Telegram-Bot-Api-Secret-Token. */
export async function webhookSecret(): Promise<string | null> {
  return getSetting(KEYS.tgWebhookSecret);
}

/** Route one update into the same handlers the poller uses. */
export async function processUpdate(update: Record<string, any>): Promise<void> {
  if (update.message) await handleMessage(update.message);
  else if (update.callback_query) {
    const chatId = String(update.callback_query.message?.chat?.id ?? "");
    if (chatId) await handleCallback(update.callback_query, chatId);
  }
}

function randomSecret(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function ensureBotRunning(): Promise<boolean> {
  const token = await resolveToken();
  if (!token) {
    g.__reelayBot = undefined;
    return false;
  }
  if (g.__reelayBot?.token === token) return true;

  // webhook mode takes over when a public URL has been registered
  const webhookUrl = await getSetting(KEYS.tgWebhook);
  if (webhookUrl) {
    const gen = ++generation;
    const chatId = await getSetting(KEYS.tgChatId);
    g.__reelayBot = { token, gen, handle: g.__reelayBot?.handle ?? null, chatId };
    void verifyToken(token).then(async (r) => {
      if (r.ok && r.handle) {
        if (g.__reelayBot) g.__reelayBot.handle = r.handle;
        await setSetting(KEYS.tgHandle, r.handle).catch(() => undefined);
      }
    });
    await registerWebhook(webhookUrl, token);
    return true;
  }

  const gen = ++generation;
  const chatId = await getSetting(KEYS.tgChatId);
  g.__reelayBot = { token, gen, handle: g.__reelayBot?.handle ?? null, chatId };

  // learn the handle once, then keep it
  void verifyToken(token).then(async (r) => {
    if (r.ok && r.handle) {
      g.__reelayBot!.handle = r.handle;
      await setSetting(KEYS.tgHandle, r.handle).catch(() => undefined);
    }
  });

  void pollLoop(token, gen);
  return true;
}

export async function stopBot(): Promise<void> {
  generation += 1;
  g.__reelayBot = undefined;
}

/* ── keyboards ──────────────────────────────────────────────── */

type Key = { text: string; callback_data: string };

function menuKeyboard(): Key[][] {
  return [
    [{ text: "📥 View queue", callback_data: "cb:queue" }, { text: "📤 View posted", callback_data: "cb:posted" }],
    [{ text: "⏱ Schedule +1h", callback_data: "cb:sch1h" }, { text: "⚙️ Bot status", callback_data: "cb:status" }],
  ];
}

/** persistent bottom menu — sent on first contact and on /start, stays put */
function homeKeyboard() {
  return {
    keyboard: [
      [{ text: "🏠 Home" }, { text: "🎬 Reels" }],
      [{ text: "📥 Queue" }, { text: "📤 Posted" }],
      [{ text: "⚙️ Settings" }],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
}

const MENU_TEXT: Record<string, string> = {
  "🏠 Home": "cb:home",
  "🎬 Reels": "cb:reels",
  "📥 Queue": "cb:queue",
  "📤 Posted": "cb:posted",
  "⚙️ Settings": "cb:status",
};

/** The Queue page's row actions — Post / Unschedule, nothing more. */
function queueActions(id: string): Key[][] {
  return [
    [
      { text: "📤 Post now", callback_data: `cb:post:${id}` },
      { text: "⏹ Unschedule", callback_data: `cb:schoff:${id}` },
    ],
    [{ text: "🎬 Reels", callback_data: "cb:reels" }],
  ];
}

async function send(chatId: string, text: string, keyboard?: Key[][], opts: Record<string, unknown> = {}) {
  return api("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    reply_markup: keyboard ? { inline_keyboard: keyboard } : undefined,
    ...opts,
  });
}

async function answer(id: string, text?: string) {
  try {
    await api("answerCallbackQuery", { callback_query_id: id, text, show_alert: false });
  } catch {
    /* already answered */
  }
}

async function edit(chatId: string, messageId: number, text: string, keyboard?: Key[][]) {
  // a keyboard press has no message to edit — send a fresh one instead
  if (!messageId) return send(chatId, text, keyboard);
  try {
    await api("editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: "HTML",
      reply_markup: keyboard ? { inline_keyboard: keyboard } : undefined,
    });
  } catch {
    /* message may be unchanged */
  }
}

/* ── notification out to the chat ───────────────────────────── */

export async function notifyChat(text: string): Promise<void> {
  const chatId = g.__reelayBot?.chatId ?? (await getSetting(KEYS.tgChatId));
  if (!chatId || !g.__reelayBot) return;
  try {
    // no parse_mode: titles are operator text and may contain markup characters
    await api("sendMessage", { chat_id: chatId, text });
  } catch {
    /* never fail a publish over a notification */
  }
}

/* ── incoming ───────────────────────────────────────────────── */

function largestPhoto(photos?: { file_id: string }[]) {
  if (!photos?.length) return null;
  return photos[photos.length - 1];
}

async function fileUrl(fileId: string): Promise<string | null> {
  try {
    const info = await api<{ file_path?: string }>("getFile", { file_id: fileId });
    const token = g.__reelayBot?.token ?? (await resolveToken());
    if (!info.file_path || !token) return null;
    return `${API}/file/bot${token}/${info.file_path}`;
  } catch {
    return null;
  }
}

function titleFromUrl(url: string) {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop();
    return (last ?? u.hostname).replace(/[-_+]/g, " ").slice(0, 60);
  } catch {
    return "linked_drop";
  }
}

function slug(s: string) {
  return s.replace(/\.[a-z0-9]+$/i, "").replace(/[-_+]+/g, " ").slice(0, 60);
}

/* ── step-by-step posting flow — one action at a time, like the site ── */

type FlowStep = "cover" | "caption" | "when" | "time" | "confirm" | "done";
type Flow = {
  videoId: string;
  step: FlowStep;
  awaitingPhoto?: boolean;
  awaitingCustomTime?: boolean;
  pickedTime?: { iso: string; label: string };
};
const flows = new Map<string, Flow>();

/** Every label matches the buttons and headings in src/components/EditBay.tsx */
function flowKeys(step: FlowStep, pending?: string): Key[][] {
  switch (step) {
    case "cover":
      return [
        [{ text: "✅ Use this cover", callback_data: "fl:cover:ok" }],
        [{ text: "🖼 Upload my cover", callback_data: "fl:cover:mine" }],
        [{ text: "🗑 Delete", callback_data: "fl:cover:del" }],
      ];
    case "caption":
      return [
        [{ text: "Save caption →", callback_data: "fl:caption:skip" }],
        [{ text: "⬅️ Back", callback_data: "fl:caption:back" }],
      ];
    case "when":
      return [
        [{ text: "🕐 Schedule post", callback_data: "fl:when:schedule" }],
        [{ text: "⚡ Post now", callback_data: "fl:when:now" }],
      ];
    case "time":
      return [
        [
          { text: "In 2 hours", callback_data: "fl:time:2h" },
          { text: "In 3 hours", callback_data: "fl:time:3h" },
        ],
        [
          { text: "Tonight 19:00", callback_data: "fl:time:tn" },
          { text: "Tomorrow 09:00", callback_data: "fl:time:tm" },
        ],
        [
          { text: "Custom time", callback_data: "fl:time:custom" },
          { text: "⬅️ Back", callback_data: "fl:time:back" },
        ],
      ];
    case "confirm":
      return [
        [{ text: "✅ Confirm schedule", callback_data: "fl:confirm:ok" }],
        [{ text: "⬅️ Change time", callback_data: "fl:confirm:back" }],
      ];
    case "done":
      return [
        [{ text: "🏠 Start the next one", callback_data: "cb:home" }],
        [{ text: "📤 View posted", callback_data: "cb:posted" }],
      ];
  }
  void pending;
  return [];
}

/**
 * Word-for-word from the website:
 * EditBay.tsx → "1 · Pick the cover", "2 · Write the caption",
 * "3 · When should it go out?", "Pick the time", "Reel posted"…
 */
async function flowText(flow: Flow, extra?: string): Promise<string> {
  const [row] = await db.select().from(videos).where(eq(videos.id, flow.videoId)).limit(1);
  const t = escapeHtml(row?.title ?? "your reel");

  switch (flow.step) {
    case "cover":
      return `1 · Pick the cover\n<b>${t}</b>\n\nThe original cover from the video is showing now. Keep it, or send me your own image (portrait works best) — this is what people see in the feed before they play it.`;

    case "caption":
      return `2 · Write the caption\n<b>${t}</b>\n\nThis is the text that appears under the reel on Instagram. Send it now, or tap Save caption to leave it empty.`;

    case "when":
      return `3 · When should it go out?\n<b>${t}</b>\n\nSchedule post opens the time picker — 2 hours, 3 hours, tonight, tomorrow, or any time you set yourself. Post now sends it straight to Instagram.`;

    case "time":
      return `3 · Pick the time\n<b>${t}</b>\n\n${formatIso(flow.pickedTime?.iso ?? "")}`;

    case "confirm":
      return `3 · Pick the time\n<b>${t}</b>\n\n<b>${flow.pickedTime?.label ?? "Custom time"}</b>\n${formatIso(flow.pickedTime?.iso ?? "")}\n\nPosts automatically when the time comes — you can close this chat.`;

    case "done":
      return `4 · Posted\n<b>${t}</b>\n\n${extra ?? ""}`;
  }
  return "";
}

async function flowGo(chatId: string, flow: Flow, extra?: string) {
  flows.set(chatId, flow);
  await send(chatId, await flowText(flow, extra), flowKeys(flow.step));
}

async function startFlow(chatId: string, videoId: string) {
  await flowGo(chatId, { videoId, step: "cover" });
}

/** Website copy: "Reel scheduled" + the countdown block on step 4. */
async function flowSchedule(chatId: string, flow: Flow, iso: string, label: string) {
  await db
    .update(videos)
    .set({ scheduledAt: new Date(iso), status: "scheduled" })
    .where(eq(videos.id, flow.videoId));
  const when = formatIso(iso);
  await flowGo(
    chatId,
    { ...flow, step: "done", pickedTime: { iso, label } },
    `Reel scheduled ✅\n${when}\nIt posts by itself — you can close this chat.\n\nChange it any time from <b>Scheduled</b>.`,
  );
}

/** Website copy: "Reel posted" / "It didn't post". */
async function flowPublish(chatId: string, flow: Flow) {
  const { publishVideo } = await import("./pipeline");
  const [row] = await db.select().from(videos).where(eq(videos.id, flow.videoId)).limit(1);
  if (!row) {
    flows.delete(chatId);
    await send(chatId, "That clip is no longer here.");
    return;
  }
  const out = await publishVideo(row);
  const extra =
    out.status === "published"
      ? out.igMediaId?.startsWith("SIM-")
        ? "Everything worked, but no Instagram key is linked yet — this was a test post. Link Zernio on the Instagram page and it will go out for real."
        : `It's live on Instagram. The cover, caption and hashtags went with it.\n<code>${out.igMediaId ?? ""}</code>`
      : `It didn't post ❌\n${out.error ?? "Unknown error"}`;
  await flowGo(chatId, { ...flow, step: "done" }, extra);
}

/** Text / photo while a flow is active — mirrors EditBay step by step. */
async function handleFlowText(msg: Record<string, any>, chatId: string) {
  const flow = flows.get(chatId);
  if (!flow) return;
  const text = typeof msg.text === "string" ? msg.text.trim() : "";
  const lc = text.toLowerCase();

  // ── 3 · Pick the time — a typed custom date/time ──────────────
  if (flow.step === "time" && flow.awaitingCustomTime) {
    const parsed = parseWhen(lc, Date.now());
    if (!parsed) {
      await send(
        chatId,
        "I couldn't read that. Send a date and time, for example:\n27 nov 20:30\ntomorrow 9am\nin 3 hours",
        flowKeys("time"),
      );
      return;
    }
    await flowGo(chatId, {
      ...flow,
      awaitingCustomTime: false,
      pickedTime: parsed,
      step: "confirm",
    });
    return;
  }

  // ── 1 · Pick the cover — an uploaded image ────────────────────
  const photo = Array.isArray(msg.photo) && msg.photo.length ? msg.photo[msg.photo.length - 1] : null;
  if (photo && (flow.step === "cover" || flow.awaitingPhoto)) {
    let saved: string | null = null;
    try {
      const url = await fileUrl(photo.file_id);
      if (url) saved = await storeCover(flow.videoId, url);
    } catch {
      saved = null;
    }
    if (saved) {
      await db
        .update(videos)
        .set({ coverImage: saved })
        .where(eq(videos.id, flow.videoId));
      await send(chatId, "🖼 Custom cover set — showing yours now.");
      await flowGo(chatId, { ...flow, step: "caption", awaitingPhoto: false });
    } else {
      await send(
        chatId,
        "⚠️ Couldn't save that image — send another one (JPG or PNG).",
        flowKeys("cover"),
      );
    }
    return;
  }

  if (flow.step === "cover") {
    if (/use (this )?cover|^go\b|next|original/i.test(lc)) {
      await flowGo(chatId, { ...flow, step: "caption", awaitingPhoto: false });
      return;
    }
    if (/upload|my own|custom|photo|image/i.test(lc)) {
      flow.awaitingPhoto = true;
      flows.set(chatId, flow);
      await send(
        chatId,
        "Upload my cover — send the image now (portrait 9:16 works best).",
        [[{ text: "⬅️ Use this cover", callback_data: "fl:cover:ok" }]],
      );
      return;
    }
    await send(
      chatId,
      "Tap a button below, or send the cover image.",
      flowKeys("cover"),
    );
    return;
  }

  // ── 2 · Write the caption ─────────────────────────────────────
  if (flow.step === "caption") {
    if (!text || text.startsWith("/")) {
      await send(
        chatId,
        "Send me the caption text, or tap Save caption to leave it empty.",
        flowKeys("caption"),
      );
      return;
    }
    await db
      .update(videos)
      .set({ caption: text.slice(0, 2200) })
      .where(eq(videos.id, flow.videoId));
    await send(chatId, "✅ Caption saved.");
    await flowGo(chatId, { ...flow, step: "when" });
    return;
  }

  await send(chatId, "Tap a button below.", flowKeys(flow.step));
}

/** The website's home copy, with live counts. */
async function homeText(): Promise<string> {
  const { listVideos } = await import("./pipeline");
  const list = await listVideos();
  const scheduled = list.filter((v) => v.status === "scheduled").length;
  const posted = list.filter((v) => v.status === "published").length;
  const waiting = list.filter((v) => v.status === "ready" || v.status === "intake").length;
  return (
    `🎬 <b>REELAY</b>\n\n` +
    `Send me a TikTok video and the four steps come back one at a time: cover, caption, when, posted.\n\n` +
    `📥 <b>Your videos</b> — ${list.length}\n` +
    `⏳ <b>Waiting for a time</b> — ${waiting}\n` +
    `📅 <b>Scheduled</b> — ${scheduled}\n` +
    `📤 <b>Posted</b> — ${posted}\n\n` +
    `<b>Commands</b>\n` +
    `/reels — your videos\n` +
    `/queue — what's scheduled\n` +
    `/posted — feed history\n` +
    `/settings — bot status`
  );
}

const MONTHS = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
];

/**
 * Parse a typed time the way the website's custom picker would.
 * Time tokens are pulled out FIRST so their digits can never be mistaken
 * for a day of the month ("20:45" must not become the 20th).
 */
function parseWhen(
  input: string,
  now: number,
): { iso: string; label: string } | null {
  const s = input.trim().toLowerCase();
  if (!s) return null;

  const d = new Date(now);

  const inHours = s.match(/^in\s+(\d{1,2})\s*h/);
  if (inHours) {
    d.setTime(now + Number(inHours[1]) * 3600_000);
    return ok(d, now);
  }
  if (/^(now|asap)$/.test(s)) {
    d.setTime(now);
    return ok(d, now);
  }

  let rest = s;
  let hasTime = false;

  // hh:mm, optionally with am/pm
  const hm = rest.match(/(\d{1,2})[:.](\d{2})\s*(am|pm)?/);
  if (hm) {
    let h = Number(hm[1]);
    const m = Number(hm[2]);
    if (hm[3] === "pm" && h < 12) h += 12;
    if (hm[3] === "am" && h === 12) h = 0;
    d.setHours(h, m, 0, 0);
    hasTime = true;
    rest = rest.replace(hm[0], " ");
  } else {
    // 9am / 8 pm
    const h12 = rest.match(/(\d{1,2})\s*(am|pm)/);
    if (h12) {
      let h = Number(h12[1]);
      if (h12[2] === "pm" && h < 12) h += 12;
      if (h12[2] === "am" && h === 12) h = 0;
      d.setHours(h, 0, 0, 0);
      hasTime = true;
      rest = rest.replace(h12[0], " ");
    }
  }

  // day anchor from the original phrase
  const isTomorrow = /tomorrow/.test(s);
  const isTonight = /tonight/.test(s);
  if (isTomorrow) d.setDate(d.getDate() + 1);

  // month, from what's left after the time was removed
  const month = rest.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/);
  let hasMonth = false;
  if (month) {
    const mi = MONTHS.indexOf(month[1].slice(0, 3));
    if (mi >= 0) {
      d.setMonth(mi);
      hasMonth = true;
    }
    rest = rest.replace(month[0], " ");
  }

  // day of month — only from digits the time didn't already consume
  const dayM = rest.match(/\b(\d{1,2})(?:st|nd|rd|th)?\b/);
  let hasDay = false;
  if (dayM) {
    const day = Number(dayM[1]);
    if (day >= 1 && day <= 31) {
      if (day < d.getDate() && !hasMonth) d.setMonth(d.getMonth() + 1);
      d.setDate(day);
      hasDay = true;
    }
  }

  // nothing we recognised — ask again rather than silently guessing tonight
  const hasAnchor = isTomorrow || isTonight || /\btoday\b/.test(s);
  if (!hasTime && !hasMonth && !hasDay && !hasAnchor) return null;

  // no explicit time: "tonight" means 19:00, anything else keeps 19:00 default
  if (!hasTime) d.setHours(isTonight || !isTomorrow ? 19 : d.getHours(), 0, 0, 0);

  // a time that has already passed today, with no day anchor, moves to tomorrow
  if (!isTomorrow && !hasMonth && !hasDay && d.getTime() <= now) {
    d.setDate(d.getDate() + 1);
  }

  return ok(d, now);
}

function ok(d: Date, now: number): { iso: string; label: string } | null {
  if (d.getTime() < now - 60_000 || d.getTime() > now + 365 * 86400_000) return null;
  return { iso: d.toISOString(), label: formatIso(d) };
}

/** Inline buttons while a flow is active (callback_data starts with fl:). */
async function handleFlowButton(cb: Record<string, any>, chatId: string) {
  const flow = flows.get(chatId);
  if (!flow) {
    await answer(cb.id, "Send me a video first");
    return;
  }
  await answer(cb.id);

  const parts = String(cb.data ?? "").split(":");
  const step = parts[1];
  const arg = parts[2];

  // ── 1 · Pick the cover ────────────────────────────────────────
  if (step === "cover") {
    if (arg === "del") {
      await db.delete(videos).where(eqId(flow.videoId));
      flows.delete(chatId);
      return edit(
        chatId,
        cb.message?.message_id ?? 0,
        "🗑 Removed from your videos.",
        menuKeyboard(),
      );
    }
    if (arg === "mine") {
      flow.awaitingPhoto = true;
      flows.set(chatId, flow);
      await send(
        chatId,
        "Upload my cover — send the image now (portrait 9:16 works best).",
        [[{ text: "⬅️ Use this cover", callback_data: "fl:cover:ok" }]],
      );
      return;
    }
    await flowGo(chatId, { ...flow, step: "caption", awaitingPhoto: false });
    return;
  }

  // ── 2 · Write the caption ─────────────────────────────────────
  if (step === "caption") {
    if (arg === "back") {
      await flowGo(chatId, { ...flow, step: "cover" });
      return;
    }
    await flowGo(chatId, { ...flow, step: "when" });
    return;
  }

  // ── 3 · When should it go out? ────────────────────────────────
  if (step === "when") {
    if (arg === "now") {
      await flowPublish(chatId, flow);
      return;
    }
    await flowGo(chatId, { ...flow, step: "time" });
    return;
  }

  // ── 3 · Pick the time ─────────────────────────────────────────
  if (step === "time") {
    if (arg === "back") {
      await flowGo(chatId, { ...flow, step: "when", pickedTime: undefined });
      return;
    }
    if (arg === "custom") {
      flow.awaitingCustomTime = true;
      flows.set(chatId, flow);
      await send(
        chatId,
        "Custom time — send a date and time, for example:\n27 nov 20:30\ntomorrow 9am\nin 3 hours",
        [[{ text: "⬅️ Back", callback_data: "fl:time:back" }]],
      );
      return;
    }

    let iso: string;
    let label: string;
    if (arg === "2h" || arg === "3h") {
      const h = arg === "2h" ? 2 : 3;
      iso = new Date(Date.now() + h * 3600_000).toISOString();
      label = `in ${h} hours`;
    } else if (arg === "tn") {
      const d = new Date();
      d.setHours(19, 0, 0, 0);
      if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
      iso = d.toISOString();
      label = "tonight 19:00";
    } else if (arg === "tm") {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
      iso = d.toISOString();
      label = "tomorrow 09:00";
    } else {
      return;
    }

    // the website confirms before it commits — same here
    await flowGo(chatId, { ...flow, step: "confirm", pickedTime: { iso, label } });
    return;
  }

  // ── 3 · Confirm schedule ──────────────────────────────────────
  if (step === "confirm") {
    if (arg === "back") {
      await flowGo(chatId, { ...flow, step: "time", pickedTime: undefined });
      return;
    }
    if (flow.pickedTime) {
      await flowSchedule(chatId, flow, flow.pickedTime.iso, flow.pickedTime.label);
    }
    return;
  }
}

async function handleIncoming(msg: Record<string, any>, chatId: string) {
  const { listVideos } = await import("./pipeline");

  const video = msg.video ?? msg.animation ?? msg.video_note ?? null;
  const doc =
    !video && msg.document && /video|mp4|quicktime/i.test(msg.document.mime_type ?? "")
      ? msg.document
      : null;
  const asset = video ?? doc;
  const caption: string = typeof msg.caption === "string" ? msg.caption : "";

  if (!asset) {
    const match = typeof msg.text === "string" ? msg.text.match(/https?:\/\/\S+/) : null;
    if (match) {
      const link = match[0];
      const [existing] = await db
        .select()
        .from(videos)
        .where(eq(videos.sourceRef, link))
        .limit(1);

      if (existing) {
        await send(
          chatId,
          `🔗 <b>${escapeHtml(existing.title)}</b>\nAlready in your videos.`,
          queueActions(existing.id),
        );
        return;
      }

      const [created] = await db
        .insert(videos)
        .values({
          title: "Downloading from TikTok…",
          thumb: "/images/v1.jpg",
          origin: "telegram",
          sourceRef: link,
          status: "intake",
          caption: "",
        })
        .returning();

      await send(chatId, `⏳ Downloading the video from TikTok…`);

      try {
        const got = await ingestTikTokLink(created.id, link);
        const [updated] = await db
          .update(videos)
          .set({
            title: got.title,
            ...(got.thumb ? { thumb: got.thumb } : {}),
            ...(got.assetUrl ? { assetUrl: got.assetUrl } : {}),
            ...(got.duration ? { durationSec: Math.min(got.duration, 900) } : {}),
          })
          .where(eq(videos.id, created.id))
          .returning();
        const u = updated ?? created;

        if (u.assetUrl) {
          await startFlow(chatId, u.id);
        } else {
          await send(
            chatId,
            `🔗 <b>${escapeHtml(u.title)}</b>\nCouldn't grab the video file. Send it as a file and I'll use that one.`,
            queueActions(u.id),
          );
        }
      } catch {
        await send(
          chatId,
          `⚠️ Couldn't download that link — send the video as a file instead.`,
          queueActions(created.id),
        );
      }
      return;
    }
    await send(
      chatId,
      "Send me a TikTok video (or a link) and I'll hand you every control as buttons.",
      menuKeyboard(),
    );
    return;
  }

  const thumbPhoto = largestPhoto(msg.video?.photos ?? msg.animation?.photos);
  let thumb = "/images/v1.jpg";
  if (thumbPhoto) {
    const u = await fileUrl(thumbPhoto.file_id);
    if (u) thumb = u;
  }
  let assetUrl: string | null = null;
  try {
    assetUrl = await fileUrl(asset.file_id);
  } catch {
    assetUrl = null;
  }

  const [created] = await db
    .insert(videos)
    .values({
      title: caption.split("\n")[0].slice(0, 60) || slug(msg.video?.file_name ?? doc?.file_name ?? "telegram_drop.mp4"),
      thumb,
      origin: "telegram",
      sourceRef: `tg:${msg.message_id}`,
      assetUrl,
      durationSec: asset.duration ?? 18,
      status: "intake",
      caption,
    })
    .returning();

  // one step at a time — cover first, exactly like the website
  await startFlow(chatId, created.id);
}

async function handleCallback(cb: Record<string, any>, chatId: string) {
  const data: string = cb.data ?? "";
  // the step-by-step wizard owns its own buttons
  if (data.startsWith("fl:")) return handleFlowButton(cb, chatId);
  // any other button leaves the wizard behind
  flows.delete(chatId);
  const [, action, id] = data.split(":");
  const { listVideos, publishVideo } = await import("./pipeline");

  const arm = async (iso: string | null, label: string) => {
    if (!id) return answer(cb.id, "Pick a clip first");
    await db
      .update(videos)
      .set({ scheduledAt: iso ? new Date(iso) : null, status: iso ? "scheduled" : "ready" })
      .where(eqId(id));
    const list = await listVideos();
    const v = list.find((x) => x.id === id);
    await edit(
      chatId,
      cb.message?.message_id ?? 0,
      `${label}\n<b>${escapeHtml(v?.title ?? "clip")}</b>\n${
        iso ? `Posts at ${formatIso(iso)}` : "No time set — it's waiting in your videos"
      }`,
      queueActions(id),
    );
  };

  switch (action) {
    // mirrors QueueView.tsx: Next to post → Scheduled → Waiting for a time
    case "queue": {
      await answer(cb.id);
      const list = await listVideos();
      const scheduled = list.filter((v) => v.status === "scheduled" && v.scheduledAt);
      const waiting = list.filter((v) => v.status === "ready" || v.status === "intake");
      const next = scheduled[0];

      if (!scheduled.length && !waiting.length) {
        return edit(
          chatId,
          cb.message?.message_id ?? 0,
          `📥 <b>Scheduled</b>\n\nNothing scheduled yet — pick a time in the console or send me a video.`,
          menuKeyboard(),
        );
      }

      const blocks: string[] = [];
      if (next) {
        blocks.push(
          `▶️ <b>Next to post</b>\n<b>${escapeHtml(next.title)}</b>\n${formatIso(
            next.scheduledAt!,
          )}\n${next.publishMode === "auto" ? "Posts by itself" : "Needs your confirmation"}`,
        );
      }
      if (scheduled.length) {
        blocks.push(
          `📅 <b>Scheduled — ${scheduled.length}</b>\n` +
            scheduled
              .slice(0, 8)
              .map(
                (v) =>
                  `   <b>${escapeHtml(v.title)}</b>\n   ${formatIso(v.scheduledAt!)} · ${
                    v.publishMode === "auto" ? "auto-post" : "ask me first"
                  }`,
              )
              .join("\n"),
        );
      }
      if (waiting.length) {
        blocks.push(
          `⏳ <b>Waiting for a time — ${waiting.length}</b>\n` +
            waiting
              .slice(0, 8)
              .map((v) => `   <b>${escapeHtml(v.title)}</b> · ${v.durationSec}s`)
              .join("\n"),
        );
      }

      return edit(
        chatId,
        cb.message?.message_id ?? 0,
        blocks.join("\n\n"),
        scheduled.length
          ? [
              [{ text: "📤 Post now", callback_data: `cb:post:${scheduled[0].id}` }],
              [{ text: "🎬 Reels", callback_data: "cb:reels" }],
            ]
          : menuKeyboard(),
      );
    }

    // mirrors PostedView.tsx: Feed history → Failed to post
    case "posted": {
      await answer(cb.id);
      const list = await listVideos();
      const p = list.filter((v) => v.status === "published");
      const failed = list.filter((v) => v.status === "failed");
      const simulated = p.filter((v) => v.igMediaId?.startsWith("SIM-")).length;

      if (!p.length && !failed.length) {
        return edit(
          chatId,
          cb.message?.message_id ?? 0,
          "📤 <b>Feed history</b>\n\nNothing posted yet. Arm a clip and the scheduler will push it to Instagram at the minute you set.",
          menuKeyboard(),
        );
      }

      const blocks: string[] = [];
      if (failed.length) {
        blocks.push(
          `⚠️ <b>Failed to post — ${failed.length}</b>\n` +
            failed
              .slice(0, 5)
              .map((v) => `   <b>${escapeHtml(v.title)}</b>\n   ${escapeHtml(v.error ?? "unknown")}`)
              .join("\n"),
        );
      }
      blocks.push(
        `📤 <b>Feed history — ${p.length}</b>\n` +
          `Total ${p.length} · Live ${p.length - simulated} · Simulated ${simulated}\n\n` +
          p
            .slice(0, 8)
            .map(
              (v) =>
                `✅ <b>${escapeHtml(v.title)}</b>\n   ${formatIso(v.publishedAt ?? v.createdAt)} · ${
                  v.igMediaId ?? ""
                }`,
            )
            .join("\n"),
      );

      return edit(
        chatId,
        cb.message?.message_id ?? 0,
        blocks.join("\n\n"),
        [[{ text: "🗑 Clear history", callback_data: "cb:clearhist" }]],
      );
    }

    // mirrors the Posted page's Clear history button
    case "clearhist": {
      await answer(cb.id);
      const { clearHistory } = await import("./pipeline");
      const removed = await clearHistory("history");
      return edit(
        chatId,
        cb.message?.message_id ?? 0,
        `🗑 Cleared ${removed} history entries.\nScheduled and inbox clips stayed.`,
        menuKeyboard(),
      );
    }
    case "status": {
      await answer(cb.id);
      const list = await listVideos();
      const armed = list.filter((v) => v.status === "scheduled").length;
      return edit(
        chatId,
        cb.message?.message_id ?? 0,
        `⚙️ <b>REELAY status</b>\n\nBot: ${botHandle()}\nScheduled: ${armed}\nPosted: ${list.filter((v) => v.status === "published").length}\nAuto-posting: running`,
        menuKeyboard(),
      );
    }
    case "sch1h":
      return arm(addHours(1), "📅 Scheduled for 1 hour from now");
    case "schoff":
      return arm(null, "⏹ Removed from the schedule");
    case "post": {
      if (!id) return answer(cb.id, "Pick a clip first");
      await answer(cb.id, "Publishing…");
      const [row] = await db.select().from(videos).where(eqId(id)).limit(1);
      if (!row) return;
      const out = await publishVideo(row);
      return edit(
        chatId,
        cb.message?.message_id ?? 0,
        out.status === "published"
          ? `✅ <b>${escapeHtml(out.title)}</b> posted\n<code>${out.igMediaId ?? ""}</code>${
              out.error ? `\n${out.error}` : ""
            }`
          : `❌ <b>${escapeHtml(out.title)}</b> failed\n${out.error ?? "unknown error"}`,
        menuKeyboard(),
      );
    }
    // mirrors the website's nav: Console · Queue · Posted
    case "home": {
      await answer(cb.id);
      return edit(
        chatId,
        cb.message?.message_id ?? 0,
        await homeText(),
        menuKeyboard(),
      );
    }

    // mirrors the Console's inbox list (section 01)
    case "reels": {
      await answer(cb.id);
      const list = await listVideos();
      const reels = list.filter((v) => v.status !== "published");
      if (!reels.length) {
        return edit(
          chatId,
          cb.message?.message_id ?? 0,
          "📥 <b>Your videos</b>\n\nNo videos yet — send me a TikTok video to get started.",
          menuKeyboard(),
        );
      }
      const icon = (s: string) =>
        s === "scheduled" ? "📅" : s === "failed" ? "⚠️" : "🎬";
      const lines = reels
        .slice(0, 12)
        .map(
          (v) =>
            `${icon(v.status)} <b>${escapeHtml(v.title)}</b>\n   ${
              v.scheduledAt ? `posts ${formatIso(v.scheduledAt)}` : "no time set"
            } · ${v.durationSec}s`,
        );
      return edit(
        chatId,
        cb.message?.message_id ?? 0,
        `📥 <b>Your videos — ${reels.length}</b>\n\n${lines.join("\n\n")}`,
        reels
          .slice(0, 8)
          .map((v) => [
            { text: `📤 Post now`, callback_data: `cb:post:${v.id}` },
            { text: "📅 Schedule", callback_data: `cb:sch1h:${v.id}` },
          ]),
      );
    }
    default:
      return answer(cb.id);
  }
}

async function handleMessage(msg: Record<string, any>) {
  const chatId = String(msg.chat?.id ?? "");
  if (!chatId) return;
  const firstContact = chatId !== (g.__reelayBot?.chatId ?? null);
  if (firstContact) {
    g.__reelayBot = g.__reelayBot ? { ...g.__reelayBot, chatId } : g.__reelayBot;
    await setSetting(KEYS.tgChatId, chatId).catch(() => undefined);
    try {
      // hand over the persistent home menu the first time we hear from a chat
      await send(chatId, await homeText(), undefined, {
        reply_markup: homeKeyboard(),
      });
    } catch {
      /* menu is best-effort */
    }
  }

  const text = typeof msg.text === "string" ? msg.text : "";

  // persistent home menu — tapped instead of typed
  const menuData = MENU_TEXT[text];
  if (menuData) {
    flows.delete(chatId);
    return handleCallback({ id: "", data: menuData, message: { message_id: 0 } }, chatId);
  }

  // an active wizard takes photos and captions
  if (flows.has(chatId)) {
    return handleFlowText(msg, chatId);
  }

  // ── commands: one per website page, nothing else ──────────────
  if (text.startsWith("/")) {
    const cmd = text.split(/[ ?]/)[0].toLowerCase();
    const to = (data: string) =>
      handleCallback({ id: "", data, message: { message_id: 0 } }, chatId);

    switch (cmd) {
      case "/start":
      case "/help":
        return send(chatId, await homeText(), undefined, {
          reply_markup: homeKeyboard(),
        });
      case "/reels":
        return to("cb:reels"); // → Console · your videos
      case "/queue":
        return to("cb:queue"); // → Queue page
      case "/posted":
        return to("cb:posted"); // → Posted page
      case "/settings":
        return to("cb:status"); // → bot + connection status
      default:
        return send(
          chatId,
          "Unknown command.\n\n/start — home and counts\n/reels — your videos\n/queue — what's scheduled\n/posted — feed history\n/settings — bot status",
          undefined,
          { reply_markup: homeKeyboard() },
        );
    }
  }
  return handleIncoming(msg, chatId);
}

async function pollLoop(token: string, gen: number) {
  let offset = 0;
  while (g.__reelayBot?.gen === gen) {
    try {
      const res = await fetch(
        `${API}/bot${token}/getUpdates?offset=${offset}&timeout=25&allowed_updates=["message","callback_query"]`,
        { cache: "no-store" },
      );
      const data = (await res.json()) as { ok: boolean; result?: any[]; description?: string };
      if (!data.ok) throw new Error(data.description ?? "getUpdates failed");
      g.__reelayBotError = null;
      for (const update of data.result ?? []) {
        offset = update.update_id + 1;
        try {
          if (update.message) await handleMessage(update.message);
          else if (update.callback_query) {
            const chatId = String(update.callback_query.message?.chat?.id ?? "");
            if (chatId) await handleCallback(update.callback_query, chatId);
            else await answer(update.callback_query.id);
          }
        } catch (e) {
          g.__reelayBotError = e instanceof Error ? e.message : "bad update";
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Telegram unreachable";
      // a Conflict just means our previous poll was cut short by this restart —
      // it clears itself on the next successful poll, so don't shout about it
      if (!/conflict/i.test(msg)) g.__reelayBotError = msg;
      await sleep(/conflict/i.test(msg) ? 6000 : 4000);
    }
  }
}

/* ── helpers ────────────────────────────────────────────────── */

import { eq } from "drizzle-orm";

const eqId = (id: string) => eq(videos.id, id);

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function formatIso(iso: string | Date) {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "—";
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return `${days[d.getDay()]} ${pad(d.getDate())} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function addHours(h: number) {
  return new Date(Date.now() + h * 3600_000).toISOString();
}

function tonight() {
  const d = new Date();
  d.setHours(19, 0, 0, 0);
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
  return d.toISOString();
}

function tomorrowNine() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}
