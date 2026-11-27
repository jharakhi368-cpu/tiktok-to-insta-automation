import { NextResponse } from "next/server";
import { envState } from "@/lib/pipeline";
import { KEYS, getMany, setSetting } from "@/lib/settings";
import { requireUser } from "@/lib/auth";
import {
  botHandle,
  botPolling,
  clearWebhook,
  ensureBotRunning,
  resolveToken,
  stopBot,
  verifyToken,
} from "@/lib/telegram";

export const dynamic = "force-dynamic";

async function state() {
  const stored = await getMany([
    KEYS.tgToken,
    KEYS.tgHandle,
    KEYS.tgChatId,
    KEYS.tgWebhook,
  ]);
  const token = await resolveToken();
  await ensureBotRunning();
  return {
    telegram: {
      webhook: stored[KEYS.tgWebhook] ?? null,
      linked: Boolean(token),
      source: stored[KEYS.tgToken] ? "console" : token ? "env" : null,
      handle: stored[KEYS.tgHandle] ?? botHandle(),
      chatId: stored[KEYS.tgChatId] ?? null,
      polling: botPolling(),
      tokenTail: token ? `…${token.slice(-4)}` : null,
    },
    env: envState(),
  };
}

/**
 * Switch the bot between long polling and webhook mode.
 *   POST {"action":"webhook"}              → register this origin's webhook
 *   POST {"action":"webhook","url":null}   → go back to long polling
 */
async function setWebhookMode(body: Record<string, unknown>) {
  const origin = String(body.url ?? "").trim();
  if (!origin) {
    await clearWebhook();
    await setSetting(KEYS.tgWebhook, null);
    await stopBot();
    await ensureBotRunning();
    return { ok: true, mode: "polling" };
  }
  const target = `${origin.replace(/\/$/, "")}/api/telegram/webhook`;
  await setSetting(KEYS.tgWebhook, target);
  await stopBot();
  await ensureBotRunning();
  return { ok: true, mode: "webhook", url: target };
}

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    const url = new URL(req.url);
    if (url.searchParams.get("test") === "1") {
      const token = await resolveToken();
      if (!token) return NextResponse.json({ ok: false, error: "No token linked yet." });
      return NextResponse.json(await verifyToken(token));
    }
    return NextResponse.json(await state());
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "settings failed" },
      { status: 500 },
    );
  }
}

/** Link (or relink) the Telegram bot. */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    const body = await req.json().catch(() => ({}));

    // switch between webhook mode (free hosts that sleep) and long polling
    if (body.action === "webhook") {
      return NextResponse.json(await setWebhookMode(body));
    }

    const token = String(body.token ?? "").trim();
    if (!token || !/^\d+:[A-Za-z0-9_-]{10,}$/.test(token)) {
      return NextResponse.json(
        { error: "That doesn't look like a bot token. Copy it from @BotFather." },
        { status: 400 },
      );
    }

    const check = await verifyToken(token);
    if (!check.ok) {
      return NextResponse.json(
        { error: check.error ?? "Telegram rejected this token." },
        { status: 400 },
      );
    }

    await setSetting(KEYS.tgToken, token);
    await setSetting(KEYS.tgHandle, check.handle ?? null);
    await stopBot();
    await ensureBotRunning();

    return NextResponse.json({ ok: true, ...(await state()) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "link failed" },
      { status: 500 },
    );
  }
}

/** Unlink the bot. */
export async function DELETE() {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    await setSetting(KEYS.tgToken, null);
    await setSetting(KEYS.tgHandle, null);
    await stopBot();
    return NextResponse.json({ ok: true, ...(await state()) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unlink failed" },
      { status: 500 },
    );
  }
}
