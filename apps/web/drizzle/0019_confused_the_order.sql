CREATE TABLE "oauth_identities" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "oauth_identities_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" bigint NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oauth_identities_provider_check" CHECK ("oauth_identities"."provider" in ('google'))
);
--> statement-breakpoint
CREATE TABLE "oauth_intents" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "oauth_intents_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"provider" text NOT NULL,
	"kind" text NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" bigint,
	"session_version" integer,
	"invitation_token_hash" text,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oauth_intents_provider_check" CHECK ("oauth_intents"."provider" in ('google')),
	CONSTRAINT "oauth_intents_kind_check" CHECK ("oauth_intents"."kind" in ('signup', 'link'))
);
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "oauth_identities" ADD CONSTRAINT "oauth_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_intents" ADD CONSTRAINT "oauth_intents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_identities_provider_subject_idx" ON "oauth_identities" USING btree ("provider","provider_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_identities_user_provider_idx" ON "oauth_identities" USING btree ("user_id","provider");--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_intents_token_hash_idx" ON "oauth_intents" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "oauth_intents_user_id_idx" ON "oauth_intents" USING btree ("user_id");