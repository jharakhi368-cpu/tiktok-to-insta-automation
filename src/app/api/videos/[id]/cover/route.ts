import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { videos } from "@/db/schema";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const ALLOWED: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const EXT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/** Uploaded covers live outside public/ — next start only serves build-time assets. */
function coverPath(id: string, ext: string) {
  return path.join(process.cwd(), ".uploads", `${id}.${ext}`);
}

async function findCover(id: string) {
  for (const ext of Object.keys(EXT_TYPES)) {
    const p = coverPath(id, ext);
    try {
      const buf = await fs.readFile(p);
      return { buf, ext };
    } catch {
      /* try next extension */
    }
  }
  return null;
}

/** Upload (or clear) a custom cover page for a clip. */
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  try {
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");

    if (!file || typeof file === "string") {
      const [cleared] = await db
        .update(videos)
        .set({ coverImage: null })
        .where(eq(videos.id, id))
        .returning();
      if (!cleared) return NextResponse.json({ error: "not found" }, { status: 404 });
      return NextResponse.json({ video: cleared });
    }

    const ext = ALLOWED[file.type];
    if (!ext) {
      return NextResponse.json({ error: "Cover must be a JPG, PNG or WebP." }, { status: 400 });
    }
    if (file.size > 4 * 1024 * 1024) {
      return NextResponse.json({ error: "Cover must be under 4 MB." }, { status: 400 });
    }

    await fs.mkdir(path.join(process.cwd(), ".uploads"), { recursive: true });

    // remove any previous cover in another format, or findCover() would serve
    // the old one (it probes jpg → png → webp in order)
    for (const other of Object.keys(EXT_TYPES)) {
      if (other === ext) continue;
      await fs.rm(coverPath(id, other), { force: true }).catch(() => undefined);
    }
    await fs.writeFile(coverPath(id, ext), Buffer.from(await file.arrayBuffer()));

    // a new version on the URL forces the browser to fetch the fresh image —
    // the GET handler ignores the query string
    const [updated] = await db
      .update(videos)
      .set({ coverImage: `/api/videos/${id}/cover?v=${Date.now()}` })
      .where(eq(videos.id, id))
      .returning();

    if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ video: updated });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "upload failed" },
      { status: 500 },
    );
  }
}

/** Serve the stored cover bytes back to the preview. */
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const found = await findCover(id);
  if (!found) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(found.buf), {
    headers: {
      "Content-Type": EXT_TYPES[found.ext],
      // the URL never changes when the cover does — never cache it, or an
      // uploaded cover would keep showing the previous image in the editor
      "Cache-Control": "no-store, no-cache, must-revalidate",
      Pragma: "no-cache",
    },
  });
}
