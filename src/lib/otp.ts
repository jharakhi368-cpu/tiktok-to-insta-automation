import { randomInt, timingSafeEqual } from "crypto";
import { eq, sql } from "drizzle-orm";
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
      let message = `Email send failed (${res.status}): ${
        data.message ?? data.name ?? "unknown Resend error"
      }`;

      // Resend's onboarding sender only delivers to the address that owns the
      // Resend account — a common way a *correct* key still fails. Only append
      // this when the error is actually about the sender, never to a bad key.
      const senderFault =
        res.status === 403 || /sender|domain|verif|from address|onboarding/i.test(message);
      if (senderFault && fromAddress === "onboarding@resend.dev") {
        message +=
          " — the default Resend sender only delivers to the email address that owns your Resend account. Sign in with that same address, or set EMAIL_FROM to a sender you have verified.";
      }
      return { ok: false, error: message };
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


/** Never let a connection string or credential reach a log line. */
function describeDbError(e: unknown): { code?: string; message: string } {
  const err = e as { code?: string; message?: string };
  const message = String(err?.message ?? e)
    .replace(/postgres(?:ql)?:\/\/[^\s@]+@/gi, "postgres://[redacted]@")
    .replace(/(?:password|token|key)\s*=\s*[^\s,;]+/gi, "$1=[redacted]");
  return { code: err?.code, message };
}

type SchemaStatus = { ok: true } | { ok: false; error: string };

/**
 * ON CONFLICT ("email") needs a real PRIMARY KEY on that column. If the table
 * was never pushed to this database — or was created without the constraint —
 * PostgreSQL rejects the upsert with a confusing error, so check first and say
 * exactly what is missing.
 */
export async function checkOtpSchema(): Promise<SchemaStatus> {
  try {
    const res = (await db.execute(sql`
      SELECT
        EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'otps'
        ) AS has_table,
        EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE table_schema = 'public' AND table_name = 'otps'
            AND constraint_type = 'PRIMARY KEY'
        ) AS has_pk,
        EXISTS (
          SELECT 1 FROM pg_index i
          WHERE i.indrelid = 'otps'::regclass
            AND i.indisunique
            AND (
              SELECT string_agg(a.attname, ', ' ORDER BY k.ord)
                FROM unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord)
                JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
            ) = 'email'
        ) AS has_unique_email,
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'otps'
            AND column_name = 'email'
        ) AS has_email
    `)) as unknown as { rows?: Array<Record<string, boolean>> };
    const row = res.rows?.[0];

    if (!row) return { ok: true }; // driver returned nothing — don't block login
    if (!row.has_table) {
      return {
        ok: false,
        error:
          "The otps table does not exist on this database. Run: node scripts/fix-otps.mjs",
      };
    }
    if (!row.has_email) {
      return { ok: false, error: 'The otps table has no "email" column.' };
    }
    // ON CONFLICT ("email") is satisfied by a primary key OR a unique index
    if (!row.has_pk && !row.has_unique_email) {
      return {
        ok: false,
        error:
          'The otps table has no PRIMARY KEY or unique index on "email", so ON CONFLICT ("email") cannot work. Run: node scripts/fix-otps.mjs',
      };
    }
    return { ok: true };
  } catch (e) {
    // never block sign-in because a diagnostic query failed
    console.error("[otp] schema check failed", describeDbError(e));
    return { ok: true };
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

  const schema = await checkOtpSchema();
  if (!schema.ok) return { ok: false, error: schema.error };

  const code = String(randomInt(100000, 1000000));
  const expiresAt = new Date(Date.now() + TTL_MS);
  const row = { code, expiresAt, attempts: 0, createdAt: new Date() };

  try {
    await db
      .insert(otps)
      .values({ email, ...row })
      .onConflictDoUpdate({
        target: otps.email,
        set: { code, expiresAt, attempts: 0, createdAt: new Date() },
      });
  } catch (e) {
    // Log the real PostgreSQL error (code + message, credentials redacted)
    // instead of letting it vanish behind a generic500.
    const info = describeDbError(e);
    console.error("[otp] insert failed", info.code ?? "", info.message);

    // The upsert needs a unique index on email. If this database does not have
    // one, fall back to UPDATE-then-INSERT so sign-in still works.
    try {
      const updated = await db
        .update(otps)
        .set({ code, expiresAt, attempts: 0, createdAt: new Date() })
        .where(eq(otps.email, email))
        .returning({ email: otps.email });
      if (!updated.length) {
        await db.insert(otps).values({ email, ...row });
      }
      console.warn(
        `[otp] used fallback upsert (no unique index on otps.email) — run: node scripts/fix-otps.mjs`,
      );
    } catch (fallbackError) {
      const fb = describeDbError(fallbackError);
      console.error("[otp] fallback upsert failed", fb.code ?? "", fb.message);
      throw e; // surface the ORIGINAL error to the caller
    }
  }

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
