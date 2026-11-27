import type { Config } from "drizzle-kit";

/**
 * The connection string comes from the environment — never from this file.
 *
 * The previous drizzle.config.json hardcoded a localhost credential, which
 * meant `DATABASE_URL=postgresql://…neon… npx drizzle-kit push` silently
 * pushed the schema to 127.0.0.1 instead of Neon. Keeping it in the
 * environment means:
 *
 *   - your database credentials are never committed
 *   - push can only ever target the database you point it at
 *   - a missing variable fails loudly instead of writing to the wrong place
 */
const url = process.env.DATABASE_URL;

if (!url) {
  throw new Error(
    "DATABASE_URL is not set. Point it at your database before running drizzle-kit, e.g.\n" +
      '  DATABASE_URL="postgresql://…neon…" npx drizzle-kit push',
  );
}

const config: Config = {
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  dbCredentials: { url },
};

export default config;
