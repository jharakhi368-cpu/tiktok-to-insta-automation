import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { videos, type VideoStatus } from "@/db/schema";
import { envState, listVideos, publishVideo } from "@/lib/pipeline";
import { ensureBotRunning } from "@/lib/telegram";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const [row] = await db.select().from(videos).where(eq(videos.id, id)).limit(1);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ video: row });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  await ensureBotRunning();
  const body = await req.json().catch(() => ({}));
  const patch: Partial<typeof videos.$inferInsert> = {};

  if (typeof body.caption === "string") patch.caption = body.caption.slice(0, 2200);
  if (typeof body.title === "string" && body.title.trim()) patch.title = body.title.slice(0, 80);
  if (Number.isInteger(body.coverFrame)) {
    patch.coverFrame = Math.max(0, Math.min(5, Number(body.coverFrame)));
  }
  // clearing / setting a custom cover from the editor
  if ("coverImage" in body) {
    patch.coverImage = typeof body.coverImage === "string" ? body.coverImage : null;
  }
  if (typeof body.firstComment === "boolean") patch.firstComment = body.firstComment;
  if (typeof body.shareToStory === "boolean") patch.shareToStory = body.shareToStory;
  if (body.publishMode === "auto" || body.publishMode === "manual") {
    patch.publishMode = body.publishMode;
  }
  if ("scheduledAt" in body) {
    patch.scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
  }
  if (body.status && typeof body.status === "string") {
    patch.status = body.status as VideoStatus;
  }

  const [updated] = await db
    .update(videos)
    .set(patch)
    .where(eq(videos.id, id))
    .returning();
  if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ video: updated, env: envState() });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  await db.delete(videos).where(eq(videos.id, id));
  return NextResponse.json({ ok: true, videos: await listVideos() });
}

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  if (body.action === "publish") {
    const [row] = await db.select().from(videos).where(eq(videos.id, id)).limit(1);
    if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
    const out = await publishVideo(row);
    return NextResponse.json({ video: out, videos: await listVideos(), env: envState() });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
