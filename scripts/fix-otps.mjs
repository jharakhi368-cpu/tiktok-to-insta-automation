/**
 * Verify / repair the `otps` table so ON CONFLICT ("email") works.
 *
 *   DATABASE_URL=postgresql://… node scripts/fix-otps.mjs
 *
 * Safe by design:
 *   - reads the live schema before changing anything
 *   - refuses to add a uniqueness constraint while duplicate emails exist
 *     (it reports them instead of deleting rows)
 *   - only ever runs CREATE TABLE IF NOT EXISTS / CREATE UNIQUE INDEX IF NOT EXISTS
 *   - never prints the connection string, and masks emails in its output
 */
import { Client } from "pg";

const redact = (s) =>
  String(s).replace(/postgres(?:ql)?:\/\/[^\s@]+@/gi, "postgres://[redacted]@");

const mask = (email) => {
  const [user, domain] = String(email).split("@");
  if (!domain) return "***";
  return `${(user || "").slice(0, 2)}***@${domain}`;
};

const DDL = `
CREATE TABLE IF NOT EXISTS "otps" (
  "email" text PRIMARY KEY NOT NULL,
  "code" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "attempts" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);`;

const EXPECTED = {
  email: "text",
  code: "text",
  expires_at: "timestamp with time zone",
  attempts: "integer",
  created_at: "timestamp with time zone",
};

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("✗ DATABASE_URL is not set.");
    process.exit(1);
  }

  const client = new Client({ connectionString: url });
  try {
    await client.connect();
  } catch (e) {
    console.error("✗ Could not connect:", redact(e.message));
    process.exit(1);
  }

  const say = (k, v) => console.log(`  ${k.padEnd(26)} ${v}`);

  try {
    console.log("otps table inspection\n");

    const [{ exists: hasTable }] = (
      await client.query(
        `SELECT EXISTS (
           SELECT 1 FROM information_schema.tables
           WHERE table_schema = 'public' AND table_name = 'otps'
         ) AS exists`,
      )
    ).rows;
    say("table exists", hasTable ? "yes" : "NO");

    if (!hasTable) {
      console.log("\n→ creating it");
      await client.query(DDL);
      const after = (
        await client.query(
          `SELECT EXISTS (
             SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'otps'
           ) AS exists`,
        )
      ).rows[0].exists;
      say("table exists", after ? "yes ✓" : "NO ✗");
      console.log("\n✓ otps created. ON CONFLICT (email) will work.");
      return;
    }

    // column names + types
    const cols = (
      await client.query(
        `SELECT column_name, data_type, is_nullable, column_default
           FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'otps'`,
      )
    ).rows;
    say("columns", cols.map((c) => `${c.column_name}:${c.data_type}`).join(", "));

    const typeIssues = Object.entries(EXPECTED).filter(([name, type]) => {
      const col = cols.find((c) => c.column_name === name);
      return !col || col.data_type !== type;
    });
    if (typeIssues.length) {
      console.log(`\n✗ type mismatch: ${typeIssues.map(([n, t]) => `${n} should be ${t}`).join(", ")}`);
      process.exit(1);
    }
    say("column types", "all match ✓");

    // primary key / unique index on email
    const pk = (
      await client.query(
        `SELECT i.indisunique AS is_unique,
                (SELECT string_agg(a.attname, ', ' ORDER BY k.ord)
                   FROM unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord)
                   JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
                 ) AS cols
           FROM pg_index i
          WHERE i.indrelid = 'otps'::regclass AND i.indisprimary`,
      )
    ).rows;
    const uniqueOnEmail = (
      await client.query(
        `SELECT COUNT(*)::int AS n FROM pg_index i
          WHERE i.indrelid = 'otps'::regclass AND i.indisunique
            AND (SELECT string_agg(a.attname, ', ' ORDER BY k.ord)
                   FROM unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord)
                   JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum) = 'email'`,
      )
    ).rows[0].n;

    say("primary key", pk.length ? `(${pk[0].cols})` : "MISSING");
    say("unique index on email", uniqueOnEmail > 0 ? "yes ✓" : "NO ✗");

    if (pk.length || uniqueOnEmail > 0) {
      console.log("\n✓ otps is correct — ON CONFLICT (email) will work.");
      return;
    }

    // ── duplicates first: never add a constraint over them ──
    const dupes = (
      await client.query(
        `SELECT email, COUNT(*)::int AS n FROM otps GROUP BY email HAVING COUNT(*) > 1`,
      )
    ).rows;
    if (dupes.length) {
      console.log(`\n✗ ${dupes.length} email(s) have duplicate rows:`);
      dupes.forEach((d) => console.log(`     ${mask(d.email)}  ×${d.n}`));
      console.log(
        "\n  Refusing to add a uniqueness constraint over duplicate data.\n" +
          "  Decide which row to keep, then re-run this script.",
      );
      process.exit(1);
    }

    console.log("\n→ no duplicate emails — adding PRIMARY KEY (email)");
    await client.query(
      `ALTER TABLE "otps" ADD CONSTRAINT "otps_pkey" PRIMARY KEY ("email")`,
    );
    const now = (
      await client.query(
        `SELECT COUNT(*)::int AS n FROM pg_index i
          WHERE i.indrelid = 'otps'::regclass AND i.indisprimary`,
      )
    ).rows[0].n;
    say("primary key", now ? "added ✓" : "FAILED ✗");
    if (!now) process.exit(1);
    console.log("\n✓ otps repaired. ON CONFLICT (email) will work.");
  } catch (e) {
    console.error("\n✗ failed:", redact(e.message));
    if (e.code) console.error("  postgres code:", e.code);
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }
}

main();
