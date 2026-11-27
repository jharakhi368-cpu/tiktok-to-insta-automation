import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Serves the downloaded video so Instagram / Zernio can fetch it. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse(null, { status: 404 });

  try {
    const buf = await fs.readFile(path.join(process.cwd(), ".media", `${id}.mp4`));
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(buf.length),
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
