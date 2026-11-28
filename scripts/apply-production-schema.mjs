/**
 * Bring a database up to the schema this application expects — without ever
 * dropping, truncating or rewriting existing data.
 *
 *   DATABASE_URL="postgresql://…" node scripts/apply-production-schema.mjs
 *
 * What it runs, in order:
 *   1. CREATE TABLE IF NOT EXISTS for every table (no-op when present)
 *   2. ALTER TABLE … ADD COLUMN IF NOT EXISTS for columns added later
 *      (Postgres backfills NOT NULL columns from their DEFAULT, so existing
 *       rows are filled in rather than rejected)
 *   3. Adds the settings composite primary key — but only after confirming no
 *      duplicate (user_id, key) pairs exist, and it aborts rather than delete
 *
 * It never runs DROP, TRUNCATE, DELETE or UPDATE against your data.
 */
import { Client } from "pg";

const SENTINEL = "00000000-0000-0000-0000-000000000000";

const TABLES = [
  `CREATE TABLE IF NOT EXISTS "users" (
     "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
     "email" text NOT NULL,
     "password_hash" text,
     "created_at" timestamp with time zone DEFAULT now() NOT NULL,
     CONSTRAINT "users_email_unique" UNIQUE("email")
   )`,
  `CREATE TABLE IF NOT EXISTS "sessions" (
     "token" text PRIMARY KEY NOT NULL,
     "user_id" uuid NOT NULL,
     "expires_at" timestamp with time zone NOT NULL,
     "created_at" timestamp with time zone DEFAULT now() NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS "otps" (
     "email" text PRIMARY KEY NOT NULL,
     "code" text NOT NULL,
     "expires_at" timestamp with time zone NOT NULL,
     "attempts" integer NOT NULL DEFAULT 0,
     "created_at" timestamp with time zone NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS "settings" (
     "user_id" uuid DEFAULT '${SENTINEL}' NOT NULL,
     "key" text NOT NULL,
     "value" text NOT NULL,
     "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
     CONSTRAINT "settings_user_id_key_pk" PRIMARY KEY("user_id","key")
   )`,
  `CREATE TABLE IF NOT EXISTS "videos" (
     "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
     "title" text NOT NULL,
     "thumb" text NOT NULL,
     "origin" text DEFAULT 'telegram' NOT NULL,
     "source_ref" text,
     "asset_url" text,
     "duration_sec" integer DEFAULT 18 NOT NULL,
     "status" text DEFAULT 'intake' NOT NULL,
     "caption" text DEFAULT '' NOT NULL,
     "cover_frame" integer DEFAULT 2 NOT NULL,
     "cover_image" text,
     "scheduled_at" timestamp with time zone,
     "published_at" timestamp with time zone,
     "ig_media_id" text,
     "publish_mode" text DEFAULT 'auto' NOT NULL,
     "first_comment" boolean DEFAULT true NOT NULL,
     "share_to_story" boolean DEFAULT false NOT NULL,
     "error" text,
     "created_at" timestamp with time zone DEFAULT now() NOT NULL,
     "user_id" uuid DEFAULT '${SENTINEL}' NOT NULL
   )`,
];

/** Columns added after a table already existed. Additive only. */
const LATER_COLUMNS = [
  `ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "user_id" uuid DEFAULT '${SENTINEL}' NOT NULL`,
  `ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "user_id" uuid DEFAULT '${SENTINEL}' NOT NULL`,
];

const redact = (s) =>
  String(s).replace(/postgres(?:ql)?:\/\/[^\s@]+@/gi, "postgres://[redacted]@");

async function hasTable(client, name) {
  const r = await client.query(
    `SELECT EXISTS (SELECT 1 FROM information_schema.tables
                    WHERE table_schema='public' AND table_name=$1) AS e`,
    [name],
  );
  return r.rows[0].e;
}

async function columnExists(client, table, column) {
  const r = await client.query(
    `SELECT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema='public' AND table_name=$1 AND column_name=$2) AS e`,
    [table, column],
  );
  return r.rows[0].e;
}

/**
 * True only when the primary key is exactly (user_id, key). A table created
 * before the auth change has a primary key on (key) alone — which satisfies
 * "has a PK" but NOT ON CONFLICT (user_id, key), so it must be replaced.
 */
async function hasSettingsCompositePk(client) {
  const r = await client.query(
    `SELECT (
       SELECT string_agg(a.attname, ', ' ORDER BY k.ord)
         FROM pg_index i
         JOIN LATERAL unnest(i.indkey) WITH ORDINALITY k(attnum, ord) ON true
         JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
        WHERE i.indrelid = 'settings'::regclass AND i.indisprimary
     ) AS cols`,
  );
  const cols = String(r.rows[0].cols ?? "");
  return cols === "user_id, key" || cols === "key, user_id";
}

/** Drop a primary key — a constraint change only, no rows are touched. */
async function dropOldSettingsPk(client) {
  const r = await client.query(
    `SELECT conname FROM pg_constraint
      WHERE conrelid = 'settings'::regclass AND contype = 'p'`,
  );
  for (const row of r.rows) {
    await client.query(`ALTER TABLE "settings" DROP CONSTRAINT IF EXISTS "${row.conname}"`);
  }
}

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

  const say = (k, v) => console.log(`  ${k.padEnd(24)} ${v}`);

  try {
    console.log("Applying application schema (additive only)\n");

    // 1. tables
    for (const sql of TABLES) {
      const name = /CREATE TABLE IF NOT EXISTS "(\w+)"/.exec(sql)[1];
      const existed = await hasTable(client, name);
      await client.query(sql);
      say(name, existed ? "already exists ✓" : "created ✓");
    }

    // 2. columns added later — backfilled from their DEFAULT
    for (const sql of LATER_COLUMNS) {
      const m = /ALTER TABLE "(\w+)" ADD COLUMN IF NOT EXISTS "(\w+)"/.exec(sql);
      if (!(await columnExists(client, m[1], m[2]))) {
        await client.query(sql);
        say(`${m[1]}.${m[2]}`, "added ✓");
      } else {
        say(`${m[1]}.${m[2]}`, "present ✓");
      }
    }

    // 3. settings composite PK — required by ON CONFLICT (user_id, key)
    if (await hasSettingsCompositePk(client)) {
      say("settings PK", "(user_id, key) ✓");
    } else {
      const dupes = (
        await client.query(
          `SELECT key, COUNT(*)::int AS n FROM settings
             GROUP BY key HAVING COUNT(*) > 1`,
        )
      ).rows;
      if (dupes.length) {
        console.log(`\n✗ ${dupes.length} setting key(s) exist more than once:`);
        for (const d of dupes) {
          const rows = (
            await client.query(
              `SELECT user_id, length(value) AS len, md5(value) AS fp FROM settings
                 WHERE key = $1 ORDER BY user_id`,
              [d.key],
            )
          ).rows;
          console.log(`    ${d.key} ×${d.n}`);
          for (const r of rows) {
            const owner =
              r.user_id === SENTINEL ? "global (pre-auth)" : `account ${r.user_id.slice(0, 8)}…`;
            console.log(`      ${owner}  len=${r.len}  md5=${r.fp}`);
          }
        }
        console.log(
          "\n  Refusing to replace the primary key — values differ between rows, so" +
            "\n  choosing one would silently discard a credential." +
            "\n  Keep the row you want, delete the other, then re-run:" +
            "\n      DELETE FROM settings WHERE user_id = '00000000-0000-0000-0000-000000000000'" +
            "\n        AND key = '<the-key>';",
        );
        process.exit(1);
      }
      await dropOldSettingsPk(client); // constraint only, no rows touched
      await client.query(
        `ALTER TABLE "settings" ADD CONSTRAINT "settings_user_id_key_pk" PRIMARY KEY ("user_id","key")`,
      );
      say("settings PK", "replaced with (user_id, key) ✓");
    }

    // 4. report
    const counts = await client.query(
      `SELECT (SELECT COUNT(*)::int FROM videos) AS videos,
              (SELECT COUNT(*)::int FROM users) AS users,
              (SELECT COUNT(*)::int FROM settings) AS settings,
              (SELECT COUNT(*)::int FROM otps) AS otps`,
    );
    const c = counts.rows[0];
    console.log(
      `\n✓ Schema complete. Data present: ${c.videos} videos, ${c.users} users, ` +
        `${c.settings} settings, ${c.otps} otps.`,
    );
    console.log("  Nothing was dropped, truncated or deleted.");
  } catch (e) {
    console.error("\n✗ failed:", redact(e.message));
    if (e.code) console.error("  postgres code:", e.code);
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }
}

main();
