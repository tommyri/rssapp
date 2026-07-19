ALTER TABLE "notification_digest_deliveries" ADD COLUMN "recipient_email" text;--> statement-breakpoint
ALTER TABLE "notification_digest_deliveries" ADD COLUMN "email_subject" text;--> statement-breakpoint
ALTER TABLE "notification_digest_deliveries" ADD COLUMN "email_text" text;--> statement-breakpoint
ALTER TABLE "notification_digest_deliveries" ADD COLUMN "email_html" text;--> statement-breakpoint
ALTER TABLE "notification_digest_deliveries" ADD COLUMN "prepared_at" timestamp with time zone;