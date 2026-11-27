import { NextResponse } from "next/server";
import { envState, listVideos, runTick } from "@/lib/pipeline";
import { ensureSchedulerRunning } from "@/lib/scheduler";
import { KEYS, peekSetting, setSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";

/** Called by the console every few seconds: runs due posts, reports status. */
export async function GET(req: Request) {
  try {
    ensureSchedulerRunning();

    // remember where this install is served from, so downloaded videos can be
    // handed to Instagram / Zernio as an absolute URL
    const origin = req.headers.get("x-site-origin");
    if (origin && /^https?:\/\/[^/\s]+$/i.test(origin) && peekSetting(KEYS.siteOrigin) !== origin) {
      await setSetting(KEYS.siteOrigin, origin);
    }

    const tick = await runTick();
    return NextResponse.json({ tick, videos: await listVideos(), env: envState() });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "tick failed", env: envState() },
      { status: 500 },
    );
  }
}
