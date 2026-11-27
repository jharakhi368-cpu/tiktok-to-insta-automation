import { NextResponse } from "next/server";
import { processUpdate, webhookSecret, ensureBotRunning } from "@/lib/telegram";

export const dynamic = "force-dynamic";

/**
 * Telegram pushes updates here instead of us polling — this is what lets the
 * bot run on a free host that sleeps, because an incoming message wakes it.
 *
 * Registered by POST /api/settings {"action":"webhook"}.
 */
export async function POST(req: Request) {
  try {
    // Telegram sends the secret we passed to setWebhook
    const provided = req.headers.get("x-telegram-bot-api-secret-token");
    const expected = await webhookSecret();
    if (expected && provided !== expected) {
      return NextResponse.json({ error: "bad secret" }, { status: 403 });
    }

    const update = (await req.json().catch(() => null)) as Record<string, any> | null;
    if (!update || typeof update !== "object") {
      return NextResponse.json({ ok: true, ignored: true });
    }

    // process it, but never let a handler failure return a non-2xx —
    // Telegram would retry forever on a broken message
    try {
      await processUpdate(update);
    } catch (e) {
      console.error("[webhook] update failed", e);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[webhook] request failed", e);
    return NextResponse.json({ ok: true });
  }
}

/** Health/registrar: keeps the webhook pointed at this instance after a redeploy. */
export async function GET() {
  await ensureBotRunning();
  return NextResponse.json({ ok: true, endpoint: "/api/telegram/webhook" });
}
