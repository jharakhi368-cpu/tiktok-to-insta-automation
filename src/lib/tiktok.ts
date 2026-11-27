/**
 * TikTok link resolution + self-hosted download.
 *
 * A link alone is not a video, so REELAY fetches it the way a downloader does:
 * public oEmbed for the real title/thumbnail, then a direct-MP4 resolver
 * (tikwm) with the page HTML as fallback, then stores the file in .media/ so
 * Instagram and Zernio have something to publish.
 */

import { promises as fs } from "fs";
import path from "path";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export type TikTokMeta = {
  title?: string;
  thumbnail?: string;
  author?: string;
  duration?: number;
  mp4?: string;
};

export function isTikTok(url: string): boolean {
  return /tiktok\.com|vm\.tiktok|vt\.tiktok/i.test(url);
}

function absolutize(u: string): string {
  if (!u) return u;
  if (u.startsWith("//")) return `https:${u}`;
  if (u.startsWith("/")) return `https://www.tiktok.com${u}`;
  return u.replace(/\\u002F/g, "/").replace(/\\\//g, "/");
}

/** Real title + thumbnail from TikTok's public oEmbed endpoint. */
export async function resolveTikTok(url: string): Promise<TikTokMeta | null> {
  if (!isTikTok(url)) return null;
  try {
    const res = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`, {
      cache: "no-store",
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const d = (await res.json()) as {
      title?: string;
      thumbnail_url?: string;
      author_name?: string;
    };
    return {
      title: (d.title ?? "").trim() || undefined,
      thumbnail: d.thumbnail_url || undefined,
      author: (d.author_name ?? "").trim() || undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Title, cover, duration and a direct MP4 URL.
 * 1. oEmbed (title/cover)  2. tikwm resolver  3. the page's own playAddr.
 */
export async function resolveTikTokMedia(url: string): Promise<TikTokMeta> {
  const meta: TikTokMeta = (await resolveTikTok(url)) ?? {};

  try {
    const res = await fetch(`https://tikwm.com/api/?url=${encodeURIComponent(url)}&hd=1`, {
      headers: { "User-Agent": UA, Referer: "https://www.tikwm.com/" },
      signal: AbortSignal.timeout(18000),
      cache: "no-store",
    });
    const d = (await res.json()) as { code?: number; data?: Record<string, any> };
    const data = d?.data;
    if (d?.code === 0 && (data?.hdplay || data?.play)) {
      meta.mp4 = absolutize(String(data.hdplay || data.play));
      meta.thumbnail = meta.thumbnail ?? absolutize(String(data.cover ?? ""));
      meta.title = meta.title ?? (data.title ? String(data.title) : undefined);
      meta.author = meta.author ?? data.author?.nickname;
      meta.duration = Number(data.duration) || meta.duration;
      if (meta.mp4) return meta;
    }
  } catch {
    /* fall through to the page parse */
  }

  try {
    const html = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      signal: AbortSignal.timeout(15000),
      redirect: "follow",
    }).then((r) => r.text());
    const m = html.match(/"playAddr":"(.*?)"/) ?? html.match(/"play_addr":\{"url_list":\["(.*?)"/);
    if (m) {
      let raw = m[1];
      try {
        raw = JSON.parse(`"${raw}"`);
      } catch {
        raw = absolutize(raw);
      }
      meta.mp4 = absolutize(raw);
    }
    if (!meta.duration) {
      const d = html.match(/"duration":(\d+)/);
      if (d) meta.duration = Number(d[1]);
    }
  } catch {
    /* nothing more we can do */
  }

  return meta;
}

/** Store the MP4 in .media/ and return the path it can be served from. */
export async function downloadMedia(id: string, mp4: string): Promise<string | null> {
  try {
    const dir = path.join(process.cwd(), ".media");
    await fs.mkdir(dir, { recursive: true });
    const res = await fetch(mp4, {
      headers: { "User-Agent": UA, Referer: "https://www.tiktok.com/" },
      signal: AbortSignal.timeout(90_000),
      redirect: "follow",
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 20_000) return null; // an error page, not a video
    await fs.writeFile(path.join(dir, `${id}.mp4`), buf);
    return `/api/videos/${id}/file`;
  } catch {
    return null;
  }
}

/** Store the cover where the existing cover route can serve it. */
export async function storeCover(id: string, url: string): Promise<string | null> {
  try {
    const dir = path.join(process.cwd(), ".uploads");
    await fs.mkdir(dir, { recursive: true });
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(20_000),
      redirect: "follow",
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 2_000) return null;
    await fs.writeFile(path.join(dir, `${id}.jpg`), buf);
    return `/api/videos/${id}/cover?v=${Date.now()}`;
  } catch {
    return null;
  }
}

/** A readable name for a link — never a random short code. */
export function titleForLink(url: string, meta: TikTokMeta | null): string {
  if (meta?.title) return meta.title.slice(0, 60);
  if (meta?.author) return `TikTok by @${meta.author}`.slice(0, 60);
  try {
    const u = new URL(url);
    const handle = u.pathname.split("/").filter(Boolean)[0];
    return handle && handle.startsWith("@") ? `TikTok ${handle}`.slice(0, 60) : "TikTok video";
  } catch {
    return "TikTok video";
  }
}

/** Does the downloaded video actually exist on disk? */
export async function hasMedia(id: string): Promise<boolean> {
  try {
    const s = await fs.stat(path.join(process.cwd(), ".media", `${id}.mp4`));
    return s.size > 20_000;
  } catch {
    return false;
  }
}

/** Does the custom cover actually exist on disk? */
export async function hasCover(id: string): Promise<boolean> {
  for (const ext of ["jpg", "png", "webp"]) {
    try {
      await fs.access(path.join(process.cwd(), ".uploads", `${id}.${ext}`));
      return true;
    } catch {
      /* try the next extension */
    }
  }
  return false;
}

/**
 * Pull a TikTok link all the way in: resolve → download video + cover →
 * return the fields to write on the row.
 */
export async function ingestTikTokLink(
  id: string,
  url: string,
): Promise<{ assetUrl: string | null; thumb: string | null; duration?: number; title: string }> {
  const meta = await resolveTikTokMedia(url);
  const title = titleForLink(url, meta);

  const [assetUrl, thumb] = await Promise.all([
    meta.mp4 ? downloadMedia(id, meta.mp4) : Promise.resolve(null),
    meta.thumbnail ? storeCover(id, meta.thumbnail) : Promise.resolve(null),
  ]);

  return {
    assetUrl,
    thumb: assetUrl ? thumb ?? null : null,
    duration: meta.duration,
    title,
  };
}
