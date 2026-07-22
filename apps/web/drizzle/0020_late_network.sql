ALTER TABLE "account_audit_events" DROP CONSTRAINT "account_audit_events_type_check";--> statement-breakpoint
ALTER TABLE "account_invites" DROP CONSTRAINT "account_invites_invited_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "account_invites" ALTER COLUMN "invited_by_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "account_invites" ADD CONSTRAINT "account_invites_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_audit_events" ADD CONSTRAINT "account_audit_events_type_check" CHECK ("account_audit_events"."event_type" in ('account_suspended', 'account_restored', 'ownership_transferred', 'registration_mode_changed', 'invitation_issued', 'invitation_revoked', 'invitation_delivery_failed', 'account_deleted'));