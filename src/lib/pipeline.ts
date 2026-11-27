import { and, asc, eq, inArray, like, lte, sql } from "drizzle-orm";
import { checkZernioPost } from "./zernio";
import { db } from "@/db";
import { videos, type Video } from "@/db/schema";
import { igReady, primeIg, publishToInstagram } from "./instagram";
import { absoluteUrl } from "./settings";
import { hasCover, hasMedia, ingestTikTokLink } from "./tiktok";
import {
  botConfigured,
  botHandle,
  botLastError,
  botPolling,
  ensureBotRunning,
  notifyChat,
} from "./telegram";

export { COVER_X } from "./ui";

/**
 * Kept so existing call sites still work — deliberately inserts nothing.
 * The app starts with an empty inbox; only real clips you add appear.
 */
export async function ensureSeed(): Promise<void> {
  return;
}

export async function listVideos(): Promise<Video[]> {
  await ensureSeed();
  await ensureBotRunning();
  await primeIg();
  // operator order: clips needing work first, armed clips by air time, posts last
  const rank = sql`case ${videos.status}
    when 'intake' then 0 when 'ready' then 1
    when 'scheduled' then 2 when 'publishing' then 2 else 3 end`;
  return db
    .select()
    .from(videos)
    .orderBy(rank, asc(videos.scheduledAt), asc(videos.createdAt));
}

const STARTED_AT = Date.now();

export function envState() {
  void ensureBotRunning();
  void primeIg();
  return {
    bot: botConfigured(),
    polling: botPolling(),
    botError: botLastError(),
    botHandle: botHandle(),
    instagram: igReady(),
    scheduler: Boolean((globalThis as { __reelayScheduler?: unknown }).__reelayScheduler),
    schedulerError: (globalThis as { __schedErr?: string | null }).__schedErr ?? null,
    uptimeMs: Date.now() - STARTED_AT,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

export type EnvState = ReturnType<typeof envState>;

/** Publish one record and write the outcome back — never throws, never sticks. */
export async function publishVideo(v: Video): Promise<Video> {
  try {
    // a redeploy wipes local files — re-fetch the video and cover if they're gone
    let current = v;
    let healed = false;
    if (v.sourceRef && /^https?:\/\/\S*tiktok\.com/i.test(v.sourceRef)) {
      // hasMedia/hasCover are async — `!hasMedia(x)` would negate a Promise
      // (always truthy) and silently never heal
      const missingVideo = Boolean(v.assetUrl) && !(await hasMedia(v.id));
      const missingCover = Boolean(v.coverImage) && !(await hasCover(v.id));
      if (missingVideo || missingCover) {
        // two goes: TikTok resolvers rate-limit back-to-back requests
        for (let attempt = 0; attempt < 2 && !healed; attempt++) {
          if (attempt > 0) await new Promise((r) => setTimeout(r, 4000));
          try {
            const again = await ingestTikTokLink(v.id, v.sourceRef);
            const patch: Partial<typeof videos.$inferInsert> = {};
            if (missingVideo && again.assetUrl) patch.assetUrl = again.assetUrl;
            if (missingCover && again.thumb) patch.coverImage = again.thumb;
            if (Object.keys(patch).length) {
              const [fixed] = await db
                .update(videos)
                .set(patch)
                .where(eq(videos.id, v.id))
                .returning();
              if (fixed) current = fixed;
              healed = true;
            }
          } catch {
            /* try once more, then the publish step reports the real reason */
          }
        }
        // couldn't re-fetch — the clear failure below is written by loadBytes
      }
    }

    await db
      .update(videos)
      .set({ status: "publishing", error: null })
      .where(eq(videos.id, v.id));

    const result = await publishToInstagram({
      // a locally stored download must be an absolute URL for IG / Zernio
      videoUrl: await absoluteUrl(current.assetUrl),
      assetPath: current.assetUrl,
      coverPath: current.coverImage,
      caption: current.caption,
      shareToStory: current.shareToStory,
      firstComment: current.firstComment,
    });

    // Zernio accepted it but hasn't confirmed — don't claim it's posted
    if (result.ok && result.pending) {
      const [stuck] = await db
        .update(videos)
        .set({
          status: "publishing",
          igMediaId: result.mediaId,
          error: "Accepted by Zernio — waiting for confirmation",
        })
        .where(eq(videos.id, v.id))
        .returning();
      return stuck ?? v;
    }

    if (result.ok) {
      const [updated] = await db
        .update(videos)
        .set({
          status: "published",
          publishedAt: new Date(),
          igMediaId: result.mediaId,
          error: result.simulated ? "Test post — no Instagram key linked yet" : null,
          scheduledAt: v.scheduledAt ?? new Date(),
        })
        .where(eq(videos.id, v.id))
        .returning();

      if (updated) {
        void notifyChat(
          `${result.simulated ? "📤" : "✅"} Posted "${updated.title}" — ${
            updated.igMediaId ?? ""
          }${updated.error ? ` · ${updated.error}` : ""}`,
        );
        return updated;
      }
      return v;
    }

    const [failed] = await db
      .update(videos)
      .set({
        status: "failed",
        error: result.error,
      })
      .where(eq(videos.id, v.id))
      .returning();
    return failed ?? { ...v, status: "failed", error: result.error };
  } catch (e) {
    // a crash must never leave a clip stuck on "posting"
    const message = e instanceof Error ? e.message : "publish failed";
    try {
      const [failed] = await db
        .update(videos)
        .set({ status: "failed", error: message })
        .where(eq(videos.id, v.id))
        .returning();
      return failed ?? { ...v, status: "failed", error: message };
    } catch {
      return { ...v, status: "failed", error: message };
    }
  }
}

/**
 * Clear history (or everything) — used by the Posted page's
 * "Clear history" button and by the bot's matching button.
 */
export async function clearHistory(scope: "history" | "all" = "history"): Promise<number> {
  const removed =
    scope === "all"
      ? await db.delete(videos).returning({ id: videos.id })
      : await db
          .delete(videos)
          .where(inArray(videos.status, ["published", "failed", "publishing"]))
          .returning({ id: videos.id });
  return removed.length;
}

/** Scheduler tick: publish everything that is due and armed. */
export async function runTick(): Promise<{ due: number; published: number }> {
  await ensureSeed();
  await ensureBotRunning();
  await primeIg();
  const now = new Date();
  // atomic claim — the browser tick and the server interval must never both
  // pick up the same clip, or it would post twice
  const due = await db
    .update(videos)
    .set({ status: "publishing", error: null })
    .where(
      and(
        eq(videos.status, "scheduled"),
        eq(videos.publishMode, "auto"),
        lte(videos.scheduledAt, now),
      ),
    )
    .returning();

  let published = 0;
  for (const v of due) {
    const out = await publishVideo(v);
    if (out.status === "published") published += 1;
  }

  // finish anything Zernio is still working on, and surface real failures
  const inFlight = await db
    .select()
    .from(videos)
    .where(and(eq(videos.status, "publishing"), like(videos.igMediaId, "ZER-%")));

  for (const row of inFlight) {
    const res = await checkZernioPost(row.igMediaId!);
    if (!res) continue;
    if (res.ok) {
      await db
        .update(videos)
        .set({ status: "published", publishedAt: new Date(), error: null })
        .where(eq(videos.id, row.id));
      void notifyChat(`✅ Posted "${row.title}" — Zernio confirmed it is live`);
      published += 1;
    } else {
      await db
        .update(videos)
        .set({ status: "failed", error: res.error })
        .where(eq(videos.id, row.id));
      void notifyChat(`❌ "${row.title}" did not post: ${res.error}`);
    }
  }

  return { due: due.length, published };
}
