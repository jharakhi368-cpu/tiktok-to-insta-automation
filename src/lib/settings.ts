import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { settings, users } from "@/db/schema";

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
  resendKey: "resend_api_key", // email delivery for sign-in codes
} as const;


/**
 * The key/value store is per account: the primary key is (user_id, key), so
 * two accounts can hold different Zernio keys without colliding. Omitting the
 * user reads the global scope, which is where system settings live.
 */
const cache = new Map<string, string | null>();
const SYSTEM = "__system__"; // cache slot for keys read without a request context
/**
 * Keys written before accounts existed (or by the bot/scheduler, which have no
 * request context) live under this id. Reads fall back to it so an existing
 * Zernio key is still found; writes always resolve a real account instead.
 */
const SYSTEM_LEGACY = "00000000-0000-0000-0000-000000000000";
const ck = (key: string, userId?: string | null) => `${userId ?? SYSTEM}:${key}`;


/**
 * Which account owns this setting.
 *
 * With no user in scope (bot callbacks, the scheduler) we resolve the primary
 * account — there is no zero-UUID fallback any more. Returns null only when no
 * account exists yet, so nothing is written into a void.
 */
async function ownerFor(userId?: string | null): Promise<string | null> {
  if (userId) return userId;
  try {
    const rows = await db
      .select({ id: users.id })
      .from(users)
      .orderBy(asc(users.createdAt))
      .limit(1);
    return rows[0]?.id ?? null;
  } catch {
    return null;
  }
}


/**
 * Resolve the owning account for a settings key.
 *
 * With no user in scope (bot callbacks, the scheduler) we resolve the primary
 * account by creation order. There is no zero-UUID fallback, so a write can
 * never land under the synthetic id again. Returns null only when no account
 * exists at all, in which case the write is skipped rather than corrupted.
 */
export async function getSetting(
  key: string,
  userId?: string | null,
): Promise<string | null> {
  const cacheKey = ck(key, userId);
  if (cache.has(cacheKey)) return cache.get(cacheKey)!;
  const scope = await ownerFor(userId);
  if (!scope) return null;
  try {
    // Account scope first. Keys written before accounts existed still live in
    // the global scope, so fall back rather than reporting "not configured"
    // for a key that is actually present.
    const rows = await db
      .select({ value: settings.value })
      .from(settings)
      .where(and(eq(settings.userId, scope), eq(settings.key, key)))
      .limit(1);
    if (rows.length) {
      const value = rows[0].value;
      cache.set(cacheKey, value);
      return value;
    }
    if (scope === SYSTEM) return null;
    const legacy = await db
      .select({ value: settings.value })
      .from(settings)
      .where(and(eq(settings.userId, SYSTEM_LEGACY), eq(settings.key, key)))
      .limit(1);
    const value = legacy[0]?.value ?? null;
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
  const scope = await ownerFor(userId);
  if (!scope) {
    // no account exists yet — never write into a synthetic owner
    console.warn(`[settings] skipped ${key}: no account exists to own it`);
    return;
  }
  cache.set(cacheKey, value);
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
  const out: Record<string, string | null> = {};
  const scope = await ownerFor(userId);
  if (!scope) return out;
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
    const missing = keys.filter((k) => out[k] === null);
    if (missing.length && scope !== SYSTEM_LEGACY) {
      const legacy = await db
        .select({ key: settings.key, value: settings.value })
        .from(settings)
        .where(and(eq(settings.userId, SYSTEM_LEGACY), inArray(settings.key, missing)));
      for (const r of legacy) {
        out[r.key] = r.value;
        cache.set(ck(r.key, userId), r.value);
      }
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
