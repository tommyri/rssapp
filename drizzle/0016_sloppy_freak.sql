CREATE TABLE "account_invites" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "account_invites_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"invited_by_user_id" bigint NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instance_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"registration_mode" text DEFAULT 'open' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "instance_settings_singleton_check" CHECK ("instance_settings"."id" = 1),
	CONSTRAINT "instance_settings_registration_mode_check" CHECK ("instance_settings"."registration_mode" in ('open', 'invite_only', 'closed'))
);
--> statement-breakpoint
ALTER TABLE "account_invites" ADD CONSTRAINT "account_invites_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_invites_hash_idx" ON "account_invites" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "account_invites_email_idx" ON "account_invites" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "account_invites_pending_email_idx" ON "account_invites" USING btree ("email") WHERE "account_invites"."accepted_at" is null and "account_invites"."revoked_at" is null;