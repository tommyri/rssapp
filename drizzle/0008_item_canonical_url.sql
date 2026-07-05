ALTER TABLE "items" ADD COLUMN "canonical_url" text;--> statement-breakpoint
CREATE INDEX "items_canonical_url_idx" ON "items" USING btree ("canonical_url") WHERE "items"."canonical_url" is not null;