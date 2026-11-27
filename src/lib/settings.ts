import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";

export const KEYS = {
  tgToken: "telegram_bot_token",
  tgHandle: "telegram_bot_handle",
  tgChatId: "telegram_chat_id",
  tgWebhook: "telegram_webhook_url",
  tgWebhookSecret: "telegram_webhook_secret",
  igToken: "ig_access_token",
  igUserId: "ig_business_account_id",
  igUsername: "ig_username",
  zKey: "zernio_api_key",
  zAccount: "zernio_account_id",
  siteOrigin: "site_origin",
} as const;

/** Rows created before any account existed live here, until claimed. */
export const GLOBAL_SCOPE = "00000000-0000-0000-0000-000000000000";

/**
 * The key/value store is per account: the primary key is (user_id, key), so
 * two accounts can hold different Zernio keys without colliding. Omitting the
 * user reads the global scope, which is where system settings live.
 */
const cache = new Map<string, string | null>();
const ck = (key: string, userId?: string | null) => `${userId ?? GLOBAL_SCOPE}:${key}`;

export async function getSetting(
  key: string,
  userId?: string | null,
): Promise<string | null> {
  const cacheKey = ck(key, userId);
  if (cache.has(cacheKey)) return cache.get(cacheKey)!;
  try {
    const scope = userId ?? GLOBAL_SCOPE;
    const rows = await db
      .select({ value: settings.value })
      .from(settings)
      .where(and(eq(settings.userId, scope), eq(settings.key, key)))
      .limit(1);
    const value = rows[0]?.value ?? null;
    cache.set(cacheKey, value);
    return value;
  } catch {
    return null;
  }
}

export async function setSetting(
  key: string,
  value: string | null,
  userId?: string | null,
): Promise<void> {
  const cacheKey = ck(key, userId);
  cache.set(cacheKey, value);
  const scope = userId ?? GLOBAL_SCOPE;
  if (value === null) {
    await db
      .delete(settings)
      .where(and(eq(settings.userId, scope), eq(settings.key, key)));
    return;
  }
  await db
    .insert(settings)
    .values({ userId: scope, key, value })
    .onConflictDoUpdate({
      target: [settings.userId, settings.key],
      set: { value, updatedAt: new Date() },
    });
}

export async function getMany(
  keys: string[],
  userId?: string | null,
): Promise<Record<string, string | null>> {
  const scope = userId ?? GLOBAL_SCOPE;
  const out: Record<string, string | null> = {};
  for (const k of keys) out[k] = null;
  try {
    const rows = await db
      .select({ key: settings.key, value: settings.value })
      .from(settings)
      .where(and(eq(settings.userId, scope), inArray(settings.key, keys)));
    for (const r of rows) {
      out[r.key] = r.value;
      cache.set(ck(r.key, userId), r.value);
    }
    return out;
  } catch {
    for (const k of keys) out[k] = cache.get(ck(k, userId)) ?? null;
    return out;
  }
}

/** Synchronous peek — undefined when not fetched yet, null when definitely empty. */
export function peekSetting(key: string, userId?: string | null): string | null | undefined {
  return cache.has(ck(key, userId)) ? cache.get(ck(key, userId)) : undefined;
}

export function clearSettingCache() {
  cache.clear();
}

/** Public origin of this install, registered by the console on first load. */
export async function publicOrigin(fallback = "http://localhost:3000"): Promise<string> {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/$/, "");
  const stored = await getSetting(KEYS.siteOrigin);
  return (stored ?? fallback).replace(/\/$/, "");
}

/** Turn a stored path like /api/videos/x/file into a URL a third party can fetch. */
export async function absoluteUrl(asset: string | null | undefined): Promise<string | null> {
  if (!asset) return null;
  if (/^https?:\/\//i.test(asset)) return asset;
  return `${await publicOrigin()}${asset.startsWith("/") ? "" : "/"}${asset}`;
}
