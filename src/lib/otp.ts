import { randomInt, timingSafeEqual } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { otps, users, type User } from "@/db/schema";
import { claimOrphans } from "./auth";
import { KEYS, getSetting } from "./settings";

const TTL_MS = 10 * 60_000; //10 minutes
const MAX_SENDS = 3; // per email per15 minutes
const MAX_ATTEMPTS = 5; // wrong codes before it locks

/** email -> recent request timestamps, for the send rate limit */
const sends = new Map<string, number[]>();

/**
 * Email delivery. Without a provider configured we return the code so the
 * login screen can show it — clearly flagged, and only until a key is added.
 * Set RESEND_API_KEY and codes go out by email instead.
 */
type SendResult = { ok: true } | { ok: false; error: string };

const FROM_RE = /^[^<>@]+@[^<>@\s]+\.[^<>@\s]+$/;

/**
 * Send the code. `RESEND_API_KEY` is read from the environment — never from
 * source, never logged, never returned to the client.
 */
async function sendCode(email: string, code: string): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY || (await getSetting(KEYS.resendKey));
  if (!key) {
    return {
      ok: false,
      error:
        "Email delivery isn't configured. Set RESEND_API_KEY on the server and try again.",
    };
  }

  const from = process.env.EMAIL_FROM ?? "REELAY <onboarding@resend.dev>";
  const fromAddress = from.match(/<([^>]+)>/)?.[1] ?? from;
  if (!FROM_RE.test(fromAddress)) {
    return { ok: false, error: `EMAIL_FROM is not a valid address: ${fromAddress}` };
  }
  // Resend's onboarding sender only delivers to the account owner's own address
  if (fromAddress === "onboarding@resend.dev" && !email) {
    return { ok: false, error: "EMAIL_FROM is not set for this sender." };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject: `${code} is your REELAY sign-in code`,
        text: `Your sign-in code is ${code}.\n\nIt expires in 10 minutes. If you didn't ask for it, ignore this email.`,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    const data = (await res.json().catch(() => ({}))) as { message?: string; name?: string };
    if (!res.ok) {
      // Resend explains domain/sender problems clearly — pass it through
      return {
        ok: false,
        error: `Email send failed (${res.status}): ${
          data.message ?? data.name ?? "unknown Resend error"
        }`,
      };
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: `Could not reach the email provider: ${
        e instanceof Error ? e.message : "network error"
      }`,
    };
  }
}

export type OtpResult =
  | { ok: true; devCode?: string; emailed: boolean }
  | { ok: false; error: string };

/** Issue a fresh code for an email address. */
export async function requestOtp(rawEmail: string): Promise<OtpResult> {
  const email = rawEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return { ok: false, error: "Enter a valid email address." };
  }

  // Rate limit in memory. The otps table keys on email, so rows upsert rather
  // than accumulate — a DB count would never exceed1 and never trip the limit.
  const now = Date.now();
  const recent = (sends.get(email) ?? []).filter((t) => t > now - 15 * 60_000);
  if (recent.length >= MAX_SENDS) {
    sends.set(email, recent);
    return { ok: false, error: "Too many codes requested — try again in 15 minutes." };
  }
  recent.push(now);
  sends.set(email, recent);

  const code = String(randomInt(100000, 1000000));
  const expiresAt = new Date(Date.now() + TTL_MS);
  await db
    .insert(otps)
    .values({ email, code, expiresAt, attempts: 0, createdAt: new Date() })
    .onConflictDoUpdate({
      target: otps.email,
      set: { code, expiresAt, attempts: 0, createdAt: new Date() },
    });

  const sent = await sendCode(email, code);
  if (sent.ok) return { ok: true, emailed: true };

  // Production: never return the code — report why delivery failed instead.
  // Development: show it, because there is no inbox to read.
  if (process.env.NODE_ENV === "production") {
    return { ok: false, error: sent.error };
  }
  console.warn(`[otp] email not sent, showing code in dev: ${sent.error}`);
  return { ok: true, emailed: false, devCode: code };
}

export type VerifyResult = { ok: true; user: User } | { ok: false; error: string };

/** Check a code, then sign the account in (creating it on first use). */
export async function verifyOtp(rawEmail: string, rawCode: string): Promise<VerifyResult> {
  const email = rawEmail.trim().toLowerCase();
  const code = rawCode.trim();

  const rows = await db.select().from(otps).where(eq(otps.email, email)).limit(1);
  const row = rows[0];

  if (!row || row.expiresAt.getTime() < Date.now()) {
    return { ok: false, error: "That code expired — request a new one." };
  }
  if (row.attempts >= MAX_ATTEMPTS) {
    await db.delete(otps).where(eq(otps.email, email));
    return { ok: false, error: "Too many wrong codes — request a new one." };
  }

  const a = Buffer.from(row.code, "utf8");
  const b = Buffer.from(code, "utf8");
  const matches = a.length === b.length && timingSafeEqual(a, b);
  if (!matches) {
    await db
      .update(otps)
      .set({ attempts: row.attempts + 1 })
      .where(eq(otps.email, email));
    return { ok: false, error: `That code isn't right — ${MAX_ATTEMPTS - row.attempts - 1} tries left.` };
  }

  // single use
  await db.delete(otps).where(eq(otps.email, email));

  const found = await db.select().from(users).where(eq(users.email, email)).limit(1);
  let user = found[0];
  if (!user) {
    [user] = await db.insert(users).values({ email }).returning();
    // first account picks up anything created before auth existed
    await claimOrphans(user.id);
  }

  return { ok: true, user };
}
