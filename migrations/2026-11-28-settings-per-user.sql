-- Settings: per-account ownership
-- Adds user_id to "settings" and makes the primary key (user_id, key),
-- matching src/db/schema.ts. Safe to run more than once.
--
-- Per-account keys are claimed for the account below. Telegram and
-- site_origin stay in the global scope on purpose: the bot and the scheduler
-- read those without a request context.
--
-- A key your account already owns is left alone — the old global row is not
-- overwritten, so re-linking in the UI is never silently reverted.

ALTER TABLE "settings"
  ADD COLUMN IF NOT EXISTS "user_id" uuid
  NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';

ALTER TABLE "settings" DROP CONSTRAINT IF EXISTS "settings_pkey";
ALTER TABLE "settings" DROP CONSTRAINT IF EXISTS "settings_user_id_key_pk";
ALTER TABLE "settings"
  ADD CONSTRAINT "settings_user_id_key_pk" PRIMARY KEY ("user_id", "key");

UPDATE "settings" old
   SET "user_id" = '439a5bc1-1ad5-4f94-a649-e9569df729e6'
 WHERE old."user_id" = '00000000-0000-0000-0000-000000000000'
   AND old."key" IN (
     'ig_access_token','ig_business_account_id','ig_username',
     'zernio_api_key','zernio_account_id'
   )
   AND NOT EXISTS (
     SELECT 1 FROM settings mine
      WHERE mine.user_id = '439a5bc1-1ad5-4f94-a649-e9569df729e6'
        AND mine.key = old.key
   );
