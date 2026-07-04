ALTER TABLE "item_states" ADD COLUMN "read_later" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "item_states" ADD COLUMN "read_later_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "item_states_user_read_later_idx" ON "item_states" USING btree ("user_id","read_later");