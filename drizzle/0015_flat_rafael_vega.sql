ALTER TABLE "users" ADD COLUMN "role" text DEFAULT 'member' NOT NULL;--> statement-breakpoint
-- A one-account legacy install can be migrated without ambiguity. Multi-account
-- upgrades must use the explicit set-owner command instead of guessing which
-- person operates the deployment.
UPDATE "users"
SET "role" = 'owner'
WHERE (SELECT count(*) FROM "users") = 1
  AND "id" = (
  SELECT "id"
  FROM "users"
  ORDER BY "created_at" ASC, "id" ASC
  LIMIT 1
);--> statement-breakpoint
CREATE UNIQUE INDEX "users_single_owner_idx" ON "users" USING btree ("role") WHERE "users"."role" = 'owner';--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_check" CHECK ("users"."role" in ('owner', 'member'));
