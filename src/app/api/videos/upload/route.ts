import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { videos } from "@/db/schema";
import { envState, listVideos } from "@/lib/pipeline";
import { ensureBotRunning } from "@/lib/telegram";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const EXT_BY_TYPE: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "video/x-m4v": "m4v",
  "video/x-matroska": "mkv",
};

const FALLBACK_THUMBS = [
  "/images/v1.jpg",
  "/images/v2.jpg",
  "/images/v3.jpg",
  "/images/v4.jpg",
  "/images/v5.jpg",
];

function slugName(s: string) {
  return s.replace(/\.[a-z0-9]+$/i, "").replace(/[-_+]+/g, " ").trim().slice(0, 60) || "Untitled clip";
}

/**
 * The file-upload side of intake: the browser sends the actual video bytes
 * (multipart), we store them where the player and Zernio can reach them, and
 * return a ready-to-edit row.
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

    await ensureBotRunning();

    const form = await req.formData().catch(() => null);
    if (!form) {
      return NextResponse.json({ error: "No upload received." }, { status: 400 });
    }

    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No video file received." }, { status: 400 });
    }
    if (!file.type.startsWith("video/") && !/\.(mp4|mov|webm|m4v|mkv)$/i.test(file.name)) {
      return NextResponse.json(
        { error: "That isn't a video — send an MP4, MOV, WebM or MKV." },
        { status: 400 },
      );
    }
    if (file.size === 0) {
      return NextResponse.json({ error: "The file is empty." }, { status: 400 });
    }

    const id = crypto.randomUUID();
    const ext = EXT_BY_TYPE[file.type] ?? file.name.split(".").pop()?.toLowerCase() ?? "mp4";

    const dir = path.join(process.cwd(), ".media");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, `${id}.${ext}`), Buffer.from(await file.arrayBuffer()));

    // a poster frame extracted by the browser, so the list isn't a stock photo
    let thumb = FALLBACK_THUMBS[Math.floor(Math.random() * FALLBACK_THUMBS.length)];
    const poster = form.get("thumb");
    if (typeof poster === "string" && poster.startsWith("data:image/")) {
      const b64 = poster.slice(poster.indexOf(",") + 1);
      const bytes = Buffer.from(b64, "base64");
      if (bytes.length > 1_000) {
        const coverDir = path.join(process.cwd(), ".uploads");
        await fs.mkdir(coverDir, { recursive: true });
        await fs.writeFile(path.join(coverDir, `${id}.jpg`), bytes);
        thumb = `/api/videos/${id}/cover?v=${Date.now()}`;
      }
    }

    const duration = Math.max(1, Math.min(900, Number(form.get("duration")) || 18));
    const title = slugName(String(form.get("title") || file.name));

    const [created] = await db
      .insert(videos)
      .values({
        id,
        userId: user.id,
        title,
        thumb,
        origin: "manual",
        sourceRef: file.name,
        assetUrl: `/api/videos/${id}/file`,
        durationSec: duration,
        status: "intake",
        caption: "",
      })
      .returning();

    return NextResponse.json(
      {
        video: created,
        videos: await listVideos(user.id),
        env: envState(user.id),
        note: "Video uploaded — pick a cover to begin.",
      },
      { status: 201 },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Upload failed" },
      { status: 500 },
    );
  }
}
