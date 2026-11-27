import {
  boolean,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const VIDEO_STATUSES = [
  "intake",
  "ready",
  "scheduled",
  "publishing",
  "published",
  "failed",
] as const;

export type VideoStatus = (typeof VIDEO_STATUSES)[number];

export const videos = pgTable("videos", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  thumb: text("thumb").notNull(),
  /** where the asset landed: telegram | manual | seed */
  origin: text("origin").notNull().default("telegram"),
  sourceRef: text("source_ref"),
  /** public URL of the video file (telegram file_url / hosted asset) */
  assetUrl: text("asset_url"),
  durationSec: integer("duration_sec").notNull().default(18),
  status: text("status").notNull().default("intake"),
  caption: text("caption").notNull().default(""),
  /** filmstrip frame index, 0..5 */
  coverFrame: integer("cover_frame").notNull().default(2),
  /** operator-uploaded custom cover, overrides the scrubbed frame */
  coverImage: text("cover_image"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  igMediaId: text("ig_media_id"),
  /** auto = the scheduler publishes it when due, manual = operator hits publish */
  publishMode: text("publish_mode").notNull().default("auto"),
  firstComment: boolean("first_comment").notNull().default(true),
  shareToStory: boolean("share_to_story").notNull().default(false),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  /** owning account — rows made before sign-up belong to the sentinel */
  userId: uuid("user_id")
    .notNull()
    .default("00000000-0000-0000-0000-000000000000"),
});

/** key/value store — telegram bot token, handle, chat id, etc. */
export const settings = pgTable(
  "settings",
  {
    userId: uuid("user_id")
      .notNull()
      .default("00000000-0000-0000-0000-000000000000"),
    key: text("key").notNull(),
    value: text("value").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.userId, t.key] }) }),
);

/** A login. Passwords are scrypt hashes, never plaintext. */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** A signed-in session; the cookie carries only this random token. */
export const sessions = pgTable("sessions", {
  token: text("token").primaryKey(),
  userId: uuid("user_id").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;

export type Video = typeof videos.$inferSelect;
export type NewVideo = typeof videos.$inferInsert;
