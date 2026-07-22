ALTER TABLE "oauth_identities" DROP CONSTRAINT "oauth_identities_provider_check";--> statement-breakpoint
ALTER TABLE "oauth_intents" DROP CONSTRAINT "oauth_intents_provider_check";--> statement-breakpoint
ALTER TABLE "oauth_identities" ADD CONSTRAINT "oauth_identities_provider_check" CHECK ("oauth_identities"."provider" in ('google', 'apple'));--> statement-breakpoint
ALTER TABLE "oauth_intents" ADD CONSTRAINT "oauth_intents_provider_check" CHECK ("oauth_intents"."provider" in ('google', 'apple'));