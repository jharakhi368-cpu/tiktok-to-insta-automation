import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * Health + build identity.
 *
 * Render injects RENDER_GIT_COMMIT, so this answers "what is actually live"
 * straight from the browser — no dashboard access needed. Booleans only:
 * the Resend key value is never echoed back.
 */
export async function GET() {
  try {
    await db.execute(sql`select 1`);

    const commit = process.env.RENDER_GIT_COMMIT ?? null;

    return Response.json({
      ok: true,
      build: {
        // compare this against the latest commit on main
        commit: commit ? commit.slice(0, 7) : null,
        nodeEnv: process.env.NODE_ENV ?? null,
      },
      config: {
        // boolean only — the key value is never returned
        resendKeySet: Boolean(process.env.RESEND_API_KEY),
      },
      time: new Date().toISOString(),
    });
  } catch {
    return Response.json({ ok: false }, { status: 500 });
  }
}
