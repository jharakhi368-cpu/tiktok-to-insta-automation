import { NextResponse } from "next/server";
import { envState, listVideos, runTick } from "@/lib/pipeline";
import { ensureSchedulerRunning } from "@/lib/scheduler";
import { currentUser } from "@/lib/auth";
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

    // UptimeRobot hits this with no cookie — it must wake the scheduler and
    // learn nothing about the account.
    const user = await currentUser();
    if (!user) return NextResponse.json({ tick });

    return NextResponse.json({
      tick,
      videos: await listVideos(user.id),
      env: envState(user.id),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "tick failed", env: envState() },
      { status: 500 },
    );
  }
}
