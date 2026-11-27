/**
 * Instagram Graph API publisher.
 *
 * Credentials live in the `settings` table (linked on the /ig page) and fall
 * back to IG_ACCESS_TOKEN / IG_BUSINESS_ACCOUNT_ID. Without both present every
 * publish resolves as SIMULATED, which the UI labels honestly.
 */

import { KEYS, getSetting, peekSetting } from "./settings";
import {
  primeZernio,
  publishViaZernio,
  zernioConfig,
  zernioReady,
} from "./zernio";

const GRAPH = "https://graph.facebook.com/v21.0";

export type IgConfig = { token: string; userId: string };

export async function igConfig(): Promise<IgConfig | null> {
  const token = (await getSetting(KEYS.igToken)) || process.env.IG_ACCESS_TOKEN || null;
  const userId = (await getSetting(KEYS.igUserId)) || process.env.IG_BUSINESS_ACCOUNT_ID || null;
  return token && userId ? { token, userId } : null;
}

/** Which publisher is wired up: Zernio (no Meta app) or the Graph API. */
export function igProvider(): "zernio" | "graph" | null {
  if (zernioReady()) return "zernio";
  const t = peekSetting(KEYS.igToken) ?? process.env.IG_ACCESS_TOKEN ?? null;
  const u = peekSetting(KEYS.igUserId) ?? process.env.IG_BUSINESS_ACCOUNT_ID ?? null;
  return t && u ? "graph" : null;
}

/** sync view used by envState() — accurate once primeIg() has run */
export function igReady(): boolean {
  return igProvider() !== null;
}

export async function primeIg(): Promise<void> {
  await Promise.all([igConfig(), primeZernio()]);
}

/** Validate a token (and optionally the IG account) against the Graph API. */
export async function verifyInstagram(
  token: string,
  userId?: string,
): Promise<{ ok: boolean; username?: string; userId?: string; error?: string }> {
  const t = token.trim();
  try {
    const me = await fetch(
      `${GRAPH}/me?fields=id,username&access_token=${encodeURIComponent(t)}`,
      { cache: "no-store" },
    ).then((r) => r.json());
    if (me?.error) return { ok: false, error: me.error.message ?? "Token rejected by Meta" };

    if (userId && userId.trim()) {
      const acct = await fetch(
        `${GRAPH}/${encodeURIComponent(userId.trim())}?fields=id,username,account_type&access_token=${encodeURIComponent(t)}`,
        { cache: "no-store" },
      ).then((r) => r.json());
      if (acct?.error) return { ok: false, error: acct.error.message ?? "Account id not reachable" };
      return { ok: true, username: acct.username, userId: String(acct.id ?? userId.trim()) };
    }

    // no id given — try to discover the IG business account through the pages
    const pages = await fetch(
      `${GRAPH}/me/accounts?fields=instagram_business_account{id,username}&access_token=${encodeURIComponent(t)}`,
      { cache: "no-store" },
    ).then((r) => r.json());
    const first = pages?.data?.[0];
    const ig = Array.isArray(first?.instagram_business_account)
      ? first.instagram_business_account[0]
      : first?.instagram_business_account;
    if (ig?.id) return { ok: true, username: ig.username, userId: String(ig.id) };

    return {
      ok: true,
      username: me.username,
      error: "Token is valid, but no Instagram business account was found on it — paste the account id manually.",
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not reach Meta" };
  }
}

export type PublishResult =
  | {
      ok: true;
      mediaId: string;
      simulated: boolean;
      /** the provider accepted it but hasn't confirmed yet — keep polling */
      pending?: boolean;
      liveUrl?: string;
    }
  | { ok: false; error: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function graph(path: string, token: string, payload: Record<string, unknown>) {
  const res = await fetch(`${GRAPH}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, access_token: token }),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, any>;
  if (!res.ok || data.error) {
    throw new Error(data?.error?.message ?? `Graph API ${res.status}`);
  }
  return data;
}

const TAG_RE = /#[\p{L}\p{N}_]+/gu;

export async function publishToInstagram(input: {
  videoUrl?: string | null;
  /** our own stored path — used to hand the bytes to Zernio directly */
  assetPath?: string | null;
  /** our own stored custom cover, e.g. /api/videos/<id>/cover */
  coverPath?: string | null;
  caption: string;
  shareToStory?: boolean;
  firstComment?: boolean;
}): Promise<PublishResult> {
  // Zernio first — one POST, no Meta app, no container polling
  const z = await zernioConfig();
  if (z) return publishViaZernio(z, input as Parameters<typeof publishViaZernio>[1]);

  const cfg = await igConfig();

  if (!cfg) {
    return {
      ok: true,
      mediaId: `SIM-${Date.now().toString(36).toUpperCase()}`,
      simulated: true,
    };
  }

  if (!input.videoUrl) {
    return {
      ok: false,
      error: "No video asset on file — send the file to the bot so REELAY can host it.",
    };
  }

  // hashtags move out of the caption and into comment #1 when the toggle is on
  const tags = input.firstComment ? input.caption.match(TAG_RE) ?? [] : [];
  const body = input.firstComment
    ? input.caption.replace(TAG_RE, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim()
    : input.caption;

  try {
    // 1. create the reel container
    const container = await graph(`/${cfg.userId}/media`, cfg.token, {
      media_type: "REELS",
      video_url: input.videoUrl,
      caption: body.slice(0, 2200),
      share_to_story: input.shareToStory ? 1 : 0,
    });
    const creationId = container.id as string;

    // 2. poll until the container is FINISHED (IG transcodes server-side)
    let status = "IN_PROGRESS";
    for (let i = 0; i < 40 && status !== "FINISHED"; i++) {
      await sleep(4000);
      const res = await fetch(
        `${GRAPH}/${creationId}?fields=status_code,status&access_token=${encodeURIComponent(cfg.token)}`,
        { cache: "no-store" },
      );
      const data = (await res.json()) as { status_code?: string; status?: string };
      status = data.status_code ?? "IN_PROGRESS";
      if (status === "ERROR") throw new Error(data.status ?? "Transcode failed");
    }
    if (status !== "FINISHED") throw new Error("Transcode timed out");

    // 3. publish
    const published = await graph(`/${cfg.userId}/media_publish`, cfg.token, {
      creation_id: creationId,
    });
    const mediaId = String(published.id);

    // 4. post the stripped hashtags as the first comment (non-fatal if it fails)
    if (tags.length) {
      try {
        await graph(`/${mediaId}/comments`, cfg.token, { message: tags.join(" ") });
      } catch {
        /* comment is a bonus, never fail the post over it */
      }
    }
    return { ok: true, mediaId, simulated: false };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Publish failed" };
  }
}
