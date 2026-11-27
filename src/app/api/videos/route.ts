import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { videos } from "@/db/schema";
import { envState, listVideos } from "@/lib/pipeline";
import { ensureBotRunning } from "@/lib/telegram";
import { ingestTikTokLink, isTikTok } from "@/lib/tiktok";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

    await ensureBotRunning();
    const list = await listVideos(user.id);
    return NextResponse.json({ videos: list, env: envState(user.id) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "db error" },
      { status: 500 },
    );
  }
}

const FALLBACK_THUMBS = [
  "/images/v1.jpg",
  "/images/v2.jpg",
  "/images/v3.jpg",
  "/images/v4.jpg",
  "/images/v5.jpg",
];

function titleFromUrl(url: string) {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop();
    return (last ?? u.hostname).replace(/[-_+]/g, " ").slice(0, 60);
  } catch {
    return "linked_drop";
  }
}

function slugName(s: string) {
  return s.replace(/\.[a-z0-9]+$/i, "").replace(/[-_+]+/g, " ").slice(0, 60);
}

/**
 * Clear the history (or everything).
 *   DELETE /api/videos  {"scope":"history"}  → posted + failed + publishing
 *   DELETE /api/videos  {"scope":"all"}      → every clip in the rail
 */
export async function DELETE(req: Request) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as { scope?: string };
    const all = body.scope === "all";
    const mine = eq(videos.userId, user.id);

    const removed = all
      ? await db.delete(videos).where(mine).returning({ id: videos.id })
      : await db
          .delete(videos)
          .where(and(mine, inArray(videos.status, ["published", "failed", "publishing"])))
          .returning({ id: videos.id });

    return NextResponse.json({
      ok: true,
      removed: removed.length,
      scope: all ? "all" : "history",
      videos: await listVideos(),
      env: envState(),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "clear failed" },
      { status: 500 },
    );
  }
}

/** Manual intake: paste a TikTok link or drop a file into the rail. */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const url: string = typeof body.url === "string" ? body.url.trim() : "";
    const fileName: string =
      typeof body.fileName === "string" ? body.fileName.trim() : "";
    const thumb: string =
      typeof body.thumb === "string" && body.thumb ? body.thumb : "";

    if (!url && !fileName) {
      return NextResponse.json(
        { error: "Paste a TikTok link or drop a file." },
        { status: 400 },
      );
    }

    // the same link twice = the same clip, never a duplicate row
    if (url) {
      const [existing] = await db
        .select()
        .from(videos)
        .where(and(eq(videos.sourceRef, url), eq(videos.userId, user.id)))
        .limit(1);
      if (existing) {
        return NextResponse.json({
          video: existing,
          videos: await listVideos(user.id),
          env: envState(user.id),
          note: "That link is already in your videos.",
        });
      }
    }

    const [created] = await db
      .insert(videos)
      .values({
        userId: user.id,
        // the background download below replaces these with the real ones
        title: url ? "Adding from TikTok…" : slugName(fileName),
        thumb: thumb || FALLBACK_THUMBS[Math.floor(Math.random() * FALLBACK_THUMBS.length)],
        origin: "manual",
        sourceRef: url || fileName,
        assetUrl: null,
        status: "intake",
        caption: "",
        durationSec: 15 + Math.floor(Math.random() * 30),
      })
      .returning();

    // pull the video down in the background — the console refreshes every 5s
    if (url && isTikTok(url)) {
      void (async () => {
        try {
          const got = await ingestTikTokLink(created.id, url);
          await db
            .update(videos)
            .set({
              title: got.title,
              ...(got.thumb ? { thumb: got.thumb } : {}),
              ...(got.assetUrl ? { assetUrl: got.assetUrl } : {}),
              ...(got.duration ? { durationSec: Math.min(got.duration, 900) } : {}),
            })
            .where(eq(videos.id, created.id));
        } catch {
          /* the row stays, the operator can send the file instead */
        }
      })();
    }

    return NextResponse.json(
      {
        video: created,
        videos: await listVideos(user.id),
        env: envState(user.id),
        note:
          url && isTikTok(url)
            ? "Added — downloading the video from TikTok now."
            : null,
      },
      { status: 201 },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "intake failed" },
      { status: 500 },
    );
  }
}
