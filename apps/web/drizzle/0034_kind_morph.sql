ALTER TABLE "saved_pages" ADD COLUMN "extraction_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "saved_pages" ADD COLUMN "extraction_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "saved_pages" ADD COLUMN "extraction_next_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "saved_pages_extraction_queue_idx" ON "saved_pages" USING btree ("extraction_next_at","saved_at") WHERE "saved_pages"."status" = 'pending';