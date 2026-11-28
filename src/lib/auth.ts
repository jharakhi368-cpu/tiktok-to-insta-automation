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

export async function setSessionCookie(
  token: string,
  opts: { secure?: boolean } = {},
): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    // Never mark Secure unconditionally: a browser discards a Secure cookie on
    // http://, and a preview can be reached either way — which logs you straight
    // back out. SameSite=Lax + HttpOnly are the protections that matter here.
    secure: opts.secure ?? false,
    path: "/",
    maxAge: TTL_SECONDS,
  });
}

/** Was this request received over HTTPS (directly or via a proxy)? */
export function isSecureRequest(req: Request): boolean {
  const forwarded = req.headers.get("x-forwarded-proto");
  if (forwarded) return forwarded.split(",")[0].trim() === "https";
  try {
    return new URL(req.url).protocol === "https:";
  } catch {
    return false;
  }
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
  try {
    await db.update(videos).set({ userId }).where(eq(videos.userId, SENTINEL_USER));
    await db
      .update(settings)
      .set({ userId })
      .where(
        and(eq(settings.userId, SENTINEL_USER), inArray(settings.key, PER_ACCOUNT_KEYS)),
      );
  } catch {
    /* never abort sign-up over a claim — the account is already created */
  }
}
