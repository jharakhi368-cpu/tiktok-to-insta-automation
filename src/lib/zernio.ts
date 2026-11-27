/**
 * Zernio publisher — no Meta app, no container polling, no OAuth.
 *
 *   1. POST /v1/media/presign  → uploadUrl + publicUrl
 *   2. PUT  the video bytes    → stored on Zernio's CDN
 *   3. POST /v1/posts          → 201, post.status = "publishing"
 *   4. GET  /v1/posts/{id}     → until status is terminal
 *
 * Step 2 matters: our own preview/domain can return 403 to Instagram's
 * crawler, which is exactly why a post can look accepted here and never show
 * up on Instagram. Handing Zernio the bytes means every platform downloads
 * the video from media.zernio.com instead of from us.
 *
 * Terminal statuses: published · failed · partial · cancelled
 * Non-terminal:      scheduled · publishing · pending · draft
 */

import { promises as fs } from "fs";
import path from "path";
import { KEYS, getSetting, peekSetting, setSetting } from "./settings";
import type { PublishResult } from "./instagram";
import { findMediaPath } from "./tiktok";

const MEDIA_TYPES: Record<string, string> = {
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  m4v: "video/x-m4v",
  mkv: "video/x-matroska",
};

const BASE = () => process.env.ZERNIO_API_URL ?? "https://zernio.com/api/v1";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const POLL_TRIES = Number(process.env.ZERNIO_POLL_TRIES ?? 12);
const POLL_MS = Number(process.env.ZERNIO_POLL_MS ?? 3000);

export type ZernioCfg = { key: string; accountId: string; userId?: string | null };
export type ZernioAccount = { id: string; username?: string; platform?: string };

export type ZernioInput = {
  videoUrl?: string | null;
  /** our own stored path, e.g. /api/videos/<id>/file */
  assetPath?: string | null;
  /** our own stored path, e.g. /api/videos/<id>/cover */
  coverPath?: string | null;
  /** filled in by publishViaZernio once the cover is on Zernio's CDN */
  coverUrl?: string | null;
  caption: string;
  shareToStory?: boolean;
  firstComment?: boolean;
};

/** Account-scoped: each account holds its own key and account id. */
export async function zernioConfig(userId?: string | null): Promise<ZernioCfg | null> {
  const key = (await getSetting(KEYS.zKey, userId)) || process.env.ZERNIO_API_KEY || null;
  const accountId =
    (await getSetting(KEYS.zAccount, userId)) || process.env.ZERNIO_ACCOUNT_ID || null;
  return key && accountId ? { key, accountId } : null;
}

export function zernioReady(userId?: string | null): boolean {
  const key = peekSetting(KEYS.zKey, userId) ?? process.env.ZERNIO_API_KEY ?? null;
  const acct = peekSetting(KEYS.zAccount, userId) ?? process.env.ZERNIO_ACCOUNT_ID ?? null;
  return Boolean(key && acct);
}

export async function primeZernio(userId?: string | null): Promise<void> {
  await zernioConfig(userId);
}

async function zFetch(pathname: string, key: string, init?: RequestInit) {
  const res = await fetch(`${BASE()}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, any>;
  if (!res.ok || data.error || data.errors || data.success === false) {
    const msg =
      (typeof data.error === "string" && data.error) ||
      data?.error?.message ||
      data?.errors?.[0]?.message ||
      data?.message ||
      `Zernio ${res.status}`;
    throw new Error(String(msg));
  }
  return data;
}

/* ── accounts ─────────────────────────────────────────────────── */

export async function listZernioAccounts(apiKey: string): Promise<ZernioAccount[]> {
  for (const p of ["/accounts", "/profiles"]) {
    try {
      const data = await zFetch(p, apiKey.trim());
      const raw: any[] = Array.isArray(data)
        ? data
        : (data.data ?? data.accounts ?? data.profiles ?? []);
      const accounts: ZernioAccount[] = (Array.isArray(raw) ? raw : [])
        .map((a) => ({
          id: String(a._id ?? a.id ?? a.accountId ?? ""),
          username: a.username ?? a.handle ?? a.name ?? undefined,
          platform: String(a.platform ?? a.provider ?? "instagram"),
        }))
        .filter((a) => a.id);
      if (accounts.length) return accounts;
    } catch {
      /* try the next endpoint */
    }
  }
  return [];
}

export async function verifyZernio(
  apiKey: string,
): Promise<{ ok: boolean; accounts?: ZernioAccount[]; error?: string }> {
  try {
    const accounts = await listZernioAccounts(apiKey);
    if (!accounts.length) {
      return {
        ok: false,
        error:
          "Key accepted, but no Instagram account is connected in Zernio yet — connect one in the Zernio dashboard first.",
      };
    }
    return { ok: true, accounts };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not reach Zernio" };
  }
}

const STALE_ACCOUNT =
  /do not belong|No account with this ID|deleted, or reconnected|Refresh your account IDs/i;

export async function refreshZernioAccount(cfg: ZernioCfg): Promise<ZernioCfg | null> {
  const accounts = await listZernioAccounts(cfg.key);
  const fresh =
    accounts.find((a) => a.id === cfg.accountId) ??
    accounts.find((a) => (a.platform ?? "instagram") === "instagram") ??
    accounts[0];
  if (!fresh || fresh.id === cfg.accountId) return null;
  await setSetting(KEYS.zAccount, fresh.id, cfg.userId);
  if (fresh.username) await setSetting(KEYS.igUsername, fresh.username, cfg.userId);
  return { ...cfg, accountId: fresh.id };
}

/* ── media: give Zernio the bytes, never our own URL ──────────── */

async function loadBytes(input: ZernioInput): Promise<{
  bytes: Buffer;
  filename: string;
  contentType: string;
}> {
  const rel = input.assetPath ?? "";
  const m = rel.match(/\/api\/videos\/([0-9a-f-]{36})\/file/i);
  if (m) {
    const file = await findMediaPath(m[1]);
    if (!file) {
      // say what happened instead of a raw ENOENT path
      throw new Error(
        "the video is no longer on the server — send the link again to re-fetch it",
      );
    }
    const bytes = await fs.readFile(file);
    const ext = path.extname(file).slice(1).toLowerCase();
    return {
      bytes,
      filename: `${m[1]}.${ext}`,
      contentType: MEDIA_TYPES[ext] ?? "video/mp4",
    };
  }
  if (input.videoUrl) {
    const res = await fetch(input.videoUrl, { signal: AbortSignal.timeout(120_000) });
    if (!res.ok) throw new Error(`could not read the video (HTTP ${res.status})`);
    const bytes = Buffer.from(await res.arrayBuffer());
    return { bytes, filename: "reel.mp4", contentType: "video/mp4" };
  }
  throw new Error("no video on file");
}

/** presign → PUT → public URL that Instagram can actually fetch */
async function uploadToZernio(cfg: ZernioCfg, input: ZernioInput): Promise<string> {
  const { bytes, filename, contentType } = await loadBytes(input);

  const presign = await zFetch("/media/presign", cfg.key, {
    method: "POST",
    body: JSON.stringify({ filename, contentType, size: bytes.length }),
  });
  const uploadUrl = presign.uploadUrl ?? presign.data?.uploadUrl;
  const publicUrl = presign.publicUrl ?? presign.data?.publicUrl;
  if (!uploadUrl || !publicUrl) {
    throw new Error("Zernio did not return an upload URL");
  }

  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: new Uint8Array(bytes),
    signal: AbortSignal.timeout(300_000),
  });
  if (!put.ok) throw new Error(`upload to Zernio storage failed (HTTP ${put.status})`);

  return String(publicUrl);
}

/* ── status polling ───────────────────────────────────────────── */

async function readPost(key: string, id: string): Promise<any | null> {
  try {
    const data = await zFetch(`/posts/${encodeURIComponent(id)}`, key);
    return data.post ?? data.data ?? data;
  } catch {
    return null;
  }
}

function terminalResult(post: any, id: string): PublishResult | null {
  const st = String(post?.status ?? "").toLowerCase();
  if (st === "published") {
    const platforms = Array.isArray(post?.platforms) ? post.platforms : [];
    const live = platforms.find((p: any) => p.platformPostUrl)?.platformPostUrl;
    return { ok: true, mediaId: `ZER-${id}`, simulated: false, liveUrl: live };
  }
  if (["failed", "partial", "cancelled", "canceled"].includes(st)) {
    const platforms = Array.isArray(post?.platforms) ? post.platforms : [];
    const msg =
      platforms
        .map((p: any) => p.errorMessage || p.error)
        .filter(Boolean)
        .join(" | ") ||
      post?.error ||
      post?.message ||
      `Zernio reported "${st}"`;
    return { ok: false, error: String(msg).slice(0, 400) };
  }
  return null;
}

/** Used by the scheduler to finish posts that were still "publishing". */
export async function checkZernioPost(mediaId: string): Promise<PublishResult | null> {
  const id = String(mediaId).replace(/^ZER-/, "");
  const cfg = await zernioConfig();
  if (!cfg || !id) return null;
  const post = await readPost(cfg.key, id);
  if (!post) return null;
  return terminalResult(post, id);
}

/* ── publish ──────────────────────────────────────────────────── */

function payload(cfg: ZernioCfg, input: ZernioInput, caption: string, mediaUrl: string) {
  const cover = input.coverUrl
    ? {
        thumbnail: input.coverUrl,
        instagramThumbnail: input.coverUrl,
      }
    : {};

  const mediaItem: Record<string, unknown> = {
    type: "video",
    url: mediaUrl,
    ...cover,
  };

  return {
    content: caption.slice(0, 2200),
    mediaItems: [mediaItem],
    platforms: [
      {
        platform: "instagram",
        accountId: cfg.accountId,
        platformSpecificData: {
          contentType: "reels",
          shareToFeed: Boolean(input.shareToStory),
          // Instagram reads the reel cover from here
          ...(input.coverUrl
            ? { thumbnailUrl: input.coverUrl, instagramThumbnail: input.coverUrl }
            : {}),
        },
      },
    ],
    publishNow: true,
  };
}

function acceptedId(data: Record<string, any>): string {
  const post = data.post ?? data.data?.post ?? data.data ?? data;
  return String(post?._id ?? post?.id ?? data?.id ?? "");
}

async function submitAndConfirm(
  cfg: ZernioCfg,
  input: ZernioInput,
  caption: string,
  mediaUrl: string,
): Promise<PublishResult> {
  const data = await zFetch("/posts", cfg.key, {
    method: "POST",
    body: JSON.stringify(payload(cfg, input, caption, mediaUrl)),
  });
  const id = acceptedId(data);
  if (!id) {
    return {
      ok: false,
      error: `Zernio did not accept the post: ${JSON.stringify(data).slice(0, 240)}`,
    };
  }

  const immediate = terminalResult(data.post ?? data.data?.post ?? data.data, id);
  if (immediate) return immediate;

  for (let i = 0; i < POLL_TRIES; i++) {
    await sleep(POLL_MS);
    const post = await readPost(cfg.key, id);
    if (post) {
      const done = terminalResult(post, id);
      if (done) return done;
    }
  }

  // still going — leave it on "publishing" so the scheduler can finish it
  return { ok: true, mediaId: `ZER-${id}`, simulated: false, pending: true };
}

export async function publishViaZernio(
  cfg: ZernioCfg,
  input: ZernioInput,
): Promise<PublishResult> {
  if (!input.videoUrl && !input.assetPath) {
    return {
      ok: false,
      error: "No video asset on file — send the file to the bot so REELAY can host it.",
    };
  }

  // Zernio takes the caption exactly as written — hashtags stay inline.
  const caption = input.caption;
  const tags = caption.match(/#[\p{L}\p{N}_]+/gu) ?? [];

  // 0. hand Zernio the cover too, so Instagram uses it instead of a random frame
  if (input.coverPath?.startsWith("/api/videos/")) {
    try {
      const m = input.coverPath.match(/\/api\/videos\/([0-9a-f-]{36})\/cover/i);
      if (m) {
        // covers can be jpg, png or webp — probe like the serving route does,
        // otherwise a PNG upload silently uploads no cover at all
        let file: string | null = null;
        for (const ext of ["jpg", "png", "webp"]) {
          const candidate = path.join(process.cwd(), ".uploads", `${m[1]}.${ext}`);
          try {
            await fs.access(candidate);
            file = candidate;
            break;
          } catch {
            /* try the next extension */
          }
        }
        if (!file) throw new Error("cover file missing on disk");
        const bytes = await fs.readFile(file);
        const presign = await zFetch("/media/presign", cfg.key, {
          method: "POST",
          body: JSON.stringify({
            filename: "cover.jpg",
            contentType: "image/jpeg",
            size: bytes.length,
          }),
        });
        const uploadUrl = presign.uploadUrl ?? presign.data?.uploadUrl;
        const publicUrl = presign.publicUrl ?? presign.data?.publicUrl;
        if (uploadUrl && publicUrl) {
          const put = await fetch(uploadUrl, {
            method: "PUT",
            headers: { "Content-Type": "image/jpeg" },
            body: new Uint8Array(bytes),
            signal: AbortSignal.timeout(120_000),
          });
          if (put.ok) input.coverUrl = String(publicUrl);
        }
      }
    } catch {
      /* a missing cover must never block the post */
    }
  }

  // 1. hand Zernio the bytes so Instagram never has to reach our server
  let mediaUrl: string;
  try {
    mediaUrl = await uploadToZernio(cfg, input);
  } catch (uploadError) {
    // a genuinely public HTTPS URL can still be used as-is
    if (input.videoUrl && /^https?:\/\//i.test(input.videoUrl) && !input.assetPath?.startsWith("/")) {
      mediaUrl = input.videoUrl;
    } else {
      return {
        ok: false,
        error: `Couldn't hand the video to Zernio: ${
          uploadError instanceof Error ? uploadError.message : "upload failed"
        }`,
      };
    }
  }

  try {
    return await submitAndConfirm(cfg, input, caption, mediaUrl);
  } catch (first) {
    const message = first instanceof Error ? first.message : "Zernio publish failed";

    if (STALE_ACCOUNT.test(message)) {
      const fresh = await refreshZernioAccount(cfg);
      if (fresh) {
        try {
          return await submitAndConfirm(fresh, input, caption, mediaUrl);
        } catch (second) {
          return {
            ok: false,
            error: second instanceof Error ? second.message : "Zernio publish failed",
          };
        }
      }
      return {
        ok: false,
        error:
          "Zernio can't see that Instagram account any more — reconnect it in Zernio, then hit Refresh on the Instagram page.",
      };
    }

    if (input.firstComment && tags.length) {
      try {
        return await submitAndConfirm(cfg, input, caption, mediaUrl);
      } catch (second) {
        return {
          ok: false,
          error: second instanceof Error ? second.message : "Zernio publish failed",
        };
      }
    }
    return { ok: false, error: message };
  }
}
