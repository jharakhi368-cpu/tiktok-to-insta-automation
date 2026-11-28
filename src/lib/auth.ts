import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { and, eq, gt, inArray } from "drizzle-orm";
import { db } from "@/db";
import { sessions, settings, users, videos, type User } from "@/db/schema";

export const SESSION_COOKIE = "reelay_session";
const TTL_SECONDS = 60 * 60 * 24 * 30; //30 days
/** owns rows created before any account existed; reassigned on first sign-up */
export const SENTINEL_USER = "00000000-0000-0000-0000-000000000000";

/* ── passwords ───────────────────────────────────────────────── */

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  try {
    const a = scryptSync(password, salt, 64);
    const b = Buffer.from(hash, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/* ── sessions ────────────────────────────────────────────────── */

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await db.insert(sessions).values({
    token,
    userId,
    expiresAt: new Date(Date.now() + TTL_SECONDS * 1000),
  });
  return token;
}

export async function destroySession(token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.token, token));
}

/**
 * `Secure` must match the scheme the browser actually used. Preview and local
 * URLs are HTTP, and a Secure cookie set over HTTP is silently dropped — which
 * looked exactly like "signs up, then bounces straight back to the login page".
 * Render serves HTTPS, so this stays Secure there and works over HTTP here.
 */
export function sessionCookieSecure(req?: Request): boolean {
  const proto =
    req?.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ??
    (process.env.PUBLIC_BASE_URL?.startsWith("https://") ? "https" : undefined);
  return proto ? proto === "https" : true; // default to Secure when unknown
}

export async function setSessionCookie(token: string, req?: Request): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: sessionCookieSecure(req),
    path: "/",
    maxAge: TTL_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/** The signed-in account, or null. Reads the cookie on every request. */
export async function currentUser(): Promise<User | null> {
  try {
    const store = await cookies();
    const token = store.get(SESSION_COOKIE)?.value;
    if (!token) return null;

    const rows = await db
      .select({ user: users })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(and(eq(sessions.token, token), gt(sessions.expiresAt, new Date())))
      .limit(1);

    return rows[0]?.user ?? null;
  } catch {
    return null;
  }
}

/** For API routes: the caller, or null when unauthenticated. */
export async function requireUser(): Promise<User | null> {
  return currentUser();
}

/**
 * Give the first account everything that was created before sign-up, so a
 * deploy that predates auth doesn't orphan the existing data.
 */
/**
 * Per-account keys only. Telegram and site settings stay in the global scope
 * on purpose: the bot and scheduler are singletons that read them without a
 * request context, so claiming them would stop the bot dead.
 */
const PER_ACCOUNT_KEYS = [
  "ig_access_token",
  "ig_business_account_id",
  "ig_username",
  "zernio_api_key",
  "zernio_account_id",
];

export async function claimOrphans(userId: string): Promise<void> {
  await db.update(videos).set({ userId }).where(eq(videos.userId, SENTINEL_USER));
  await db
    .update(settings)
    .set({ userId })
    .where(
      and(eq(settings.userId, SENTINEL_USER), inArray(settings.key, PER_ACCOUNT_KEYS)),
    );
}
