ALTER TABLE "item_states" ADD COLUMN "reading_progress" real;--> statement-breakpoint
ALTER TABLE "item_states" ADD COLUMN "reading_progress_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "saved_pages" ADD COLUMN "reading_progress" real;--> statement-breakpoint
ALTER TABLE "saved_pages" ADD COLUMN "reading_progress_updated_at" timestamp with time zone;