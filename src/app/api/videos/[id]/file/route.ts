import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { findMediaPath } from "@/lib/tiktok";

export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = {
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  m4v: "video/x-m4v",
  mkv: "video/x-matroska",
};

/**
 * Serves the clip so the editor can play it and Instagram / Zernio can fetch
 * it. Supports Range requests — without them scrubbing the preview breaks.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse(null, { status: 404 });

  const file = await findMediaPath(id);
  if (!file) return new NextResponse(null, { status: 404 });

  try {
    const buf = await fs.readFile(file);
    const type = TYPES[path.extname(file).slice(1).toLowerCase()] ?? "application/octet-stream";

    const range = req.headers.get("range");
    const m = range ? /bytes=(\d*)-(\d*)/.exec(range) : null;
    if (m) {
      const start = m[1] ? Number.parseInt(m[1], 10) : 0;
      const end = m[2] ? Math.min(Number.parseInt(m[2], 10), buf.length - 1) : buf.length - 1;
      if (Number.isFinite(start) && start <= end && start < buf.length) {
        const slice = buf.subarray(start, end + 1);
        return new NextResponse(new Uint8Array(slice), {
          status: 206,
          headers: {
            "Content-Type": type,
            "Content-Range": `bytes ${start}-${end}/${buf.length}`,
            "Accept-Ranges": "bytes",
            "Content-Length": String(slice.length),
            "Cache-Control": "private, max-age=3600",
          },
        });
      }
    }

    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": type,
        "Content-Length": String(buf.length),
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
