CREATE TABLE "native_app_session_tokens" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "native_app_session_tokens_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"session_id" text NOT NULL,
	"kind" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "native_app_session_tokens_kind_check" CHECK ("native_app_session_tokens"."kind" in ('access', 'refresh'))
);
--> statement-breakpoint
CREATE TABLE "native_app_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"session_version" integer NOT NULL,
	"device_name" text NOT NULL,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "native_app_session_tokens" ADD CONSTRAINT "native_app_session_tokens_session_id_native_app_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."native_app_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "native_app_sessions" ADD CONSTRAINT "native_app_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "native_app_session_tokens_hash_idx" ON "native_app_session_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "native_app_session_tokens_session_kind_idx" ON "native_app_session_tokens" USING btree ("session_id","kind","expires_at");--> statement-breakpoint
CREATE INDEX "native_app_sessions_user_active_idx" ON "native_app_sessions" USING btree ("user_id","revoked_at","expires_at");--> statement-breakpoint
CREATE INDEX "native_app_sessions_expires_at_idx" ON "native_app_sessions" USING btree ("expires_at");