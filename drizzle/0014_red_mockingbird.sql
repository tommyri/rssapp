ALTER TABLE "users" ADD COLUMN "onboarding_completed_at" timestamp with time zone;
--> statement-breakpoint
-- Existing accounts were already using the reader before guided setup existed.
-- Mark them complete so this release only onboards newly created accounts.
UPDATE "users"
SET "onboarding_completed_at" = "created_at"
WHERE "onboarding_completed_at" IS NULL;
