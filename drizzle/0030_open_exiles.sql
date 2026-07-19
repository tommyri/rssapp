CREATE TABLE "notification_digest_deliveries" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "notification_digest_deliveries_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" bigint NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"provider_message_id" text,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_digest_deliveries_status_check" CHECK ("notification_digest_deliveries"."status" in ('pending', 'processing', 'retrying', 'sent', 'skipped', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "notification_digest_items" (
	"delivery_id" bigint NOT NULL,
	"notification_id" bigint NOT NULL,
	CONSTRAINT "notification_digest_items_delivery_id_notification_id_pk" PRIMARY KEY("delivery_id","notification_id")
);
--> statement-breakpoint
CREATE TABLE "notification_digest_settings" (
	"user_id" bigint PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"cadence" text DEFAULT 'daily' NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"delivery_hour" integer DEFAULT 8 NOT NULL,
	"delivery_minute" integer DEFAULT 0 NOT NULL,
	"weekday" integer DEFAULT 1 NOT NULL,
	"next_run_at" timestamp with time zone,
	"last_sent_at" timestamp with time zone,
	"last_test_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_digest_settings_cadence_check" CHECK ("notification_digest_settings"."cadence" in ('daily', 'weekly')),
	CONSTRAINT "notification_digest_settings_hour_check" CHECK ("notification_digest_settings"."delivery_hour" between 0 and 23),
	CONSTRAINT "notification_digest_settings_minute_check" CHECK ("notification_digest_settings"."delivery_minute" between 0 and 59),
	CONSTRAINT "notification_digest_settings_weekday_check" CHECK ("notification_digest_settings"."weekday" between 1 and 7)
);
--> statement-breakpoint
ALTER TABLE "notification_digest_deliveries" ADD CONSTRAINT "notification_digest_deliveries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_digest_items" ADD CONSTRAINT "notification_digest_items_delivery_id_notification_digest_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."notification_digest_deliveries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_digest_items" ADD CONSTRAINT "notification_digest_items_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_digest_settings" ADD CONSTRAINT "notification_digest_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_digest_deliveries_slot_idx" ON "notification_digest_deliveries" USING btree ("user_id","scheduled_for");--> statement-breakpoint
CREATE INDEX "notification_digest_deliveries_queue_idx" ON "notification_digest_deliveries" USING btree ("next_attempt_at","created_at") WHERE "notification_digest_deliveries"."status" in ('pending', 'retrying', 'processing');--> statement-breakpoint
CREATE INDEX "notification_digest_deliveries_user_created_idx" ON "notification_digest_deliveries" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_digest_items_notification_idx" ON "notification_digest_items" USING btree ("notification_id");--> statement-breakpoint
CREATE INDEX "notification_digest_settings_due_idx" ON "notification_digest_settings" USING btree ("next_run_at") WHERE "notification_digest_settings"."enabled" = true and "notification_digest_settings"."next_run_at" is not null;