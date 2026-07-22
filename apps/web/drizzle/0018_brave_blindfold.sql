CREATE TABLE "account_audit_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "account_audit_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"actor_user_id" bigint,
	"target_user_id" bigint,
	"event_type" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_audit_events_type_check" CHECK ("account_audit_events"."event_type" in ('account_suspended', 'account_restored', 'ownership_transferred', 'registration_mode_changed', 'invitation_issued', 'invitation_revoked', 'invitation_delivery_failed'))
);
--> statement-breakpoint
ALTER TABLE "account_audit_events" ADD CONSTRAINT "account_audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_audit_events" ADD CONSTRAINT "account_audit_events_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_audit_events_created_at_idx" ON "account_audit_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "account_audit_events_target_user_id_idx" ON "account_audit_events" USING btree ("target_user_id");