import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";

export const KEYS = {
  tgToken: "telegram_bot_token",
  tgHandle: "telegram_bot_handle",
  tgChatId: "telegram_chat_id",
  igToken: "ig_access_token",
  igUserId: "ig_business_account_id",
  igUsername: "ig_username",
  zKey: "zernio_api_key",
  zAccount: "zernio_account_id",
  siteOrigin: "site_origin",
  tgWebhook: "telegram_webhook_url",
  tgWebhookSecret: "telegram_webhook_secret",
} as const;

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

/** synchronous peek — undefined when not fetched yet, null when definitely empty */
export function peekSetting(key: string): string | null | undefined {
  return cache.has(key) ? cache.get(key) : undefined;
}

const cache = new Map<string, string | null>();

export async function getSetting(key: string): Promise<string | null> {
  if (cache.has(key)) return cache.get(key)!;
  try {
    const rows = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
    const value = rows[0]?.value ?? null;
    cache.set(key, value);
    return value;
  } catch {
    return null;
  }
}

export async function setSetting(key: string, value: string | null): Promise<void> {
  cache.set(key, value);
  if (value === null) {
    await db.delete(settings).where(eq(settings.key, key));
    return;
  }
  await db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
}

export async function getMany(keys: string[]): Promise<Record<string, string | null>> {
  try {
    const rows = await db
      .select()
      .from(settings)
      .where(inArray(settings.key, keys));
    const out: Record<string, string | null> = {};
    for (const k of keys) out[k] = null;
    for (const r of rows) {
      out[r.key] = r.value;
      cache.set(r.key, r.value);
    }
    return out;
  } catch {
    const out: Record<string, string | null> = {};
    for (const k of keys) out[k] = cache.get(k) ?? null;
    return out;
  }
}

export function clearSettingCache() {
  cache.clear();
}
