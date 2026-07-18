ALTER TABLE "items" ADD COLUMN "full_content_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "full_content_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "full_content_next_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "full_content_locked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "full_content_last_error" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "full_content_extracted_at" timestamp with time zone;--> statement-breakpoint
UPDATE "items"
SET
  "full_content_status" = CASE
    WHEN "full_content_html" IS NOT NULL THEN 'ready'
    WHEN "url" ~ '^https?://' THEN 'pending'
    ELSE 'not_needed'
  END,
  "full_content_extracted_at" = CASE
    WHEN "full_content_html" IS NOT NULL THEN "created_at"
    ELSE NULL
  END;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_full_content_status_check"
  CHECK ("full_content_status" IN ('not_needed', 'pending', 'processing', 'ready', 'retrying', 'unavailable'));--> statement-breakpoint
CREATE INDEX "items_full_content_queue_idx" ON "items" USING btree ("full_content_next_at","created_at") WHERE "items"."full_content_status" in ('pending', 'retrying', 'processing');
