CREATE TABLE "item_audio_progress" (
	"user_id" bigint NOT NULL,
	"item_id" bigint NOT NULL,
	"audio_url" text NOT NULL,
	"progress_seconds" real NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_audio_progress_user_id_item_id_audio_url_pk" PRIMARY KEY("user_id","item_id","audio_url")
);
--> statement-breakpoint
ALTER TABLE "item_audio_progress" ADD CONSTRAINT "item_audio_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_audio_progress" ADD CONSTRAINT "item_audio_progress_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "item_audio_progress_user_item_idx" ON "item_audio_progress" USING btree ("user_id","item_id");