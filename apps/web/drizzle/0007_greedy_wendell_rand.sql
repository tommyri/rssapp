CREATE TABLE "saved_pages" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "saved_pages_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" bigint NOT NULL,
	"url" text NOT NULL,
	"title" text,
	"byline" text,
	"site_name" text,
	"excerpt" text,
	"content_html" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp with time zone,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"search_vector" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('english', coalesce(title, '')), 'A') || setweight(to_tsvector('norwegian', coalesce(title, '')), 'A') || setweight(to_tsvector('english', coalesce(site_name, '')), 'B') || setweight(to_tsvector('english', coalesce(excerpt, '')), 'C') || setweight(to_tsvector('english', regexp_replace(coalesce(content_html, ''), '<[^>]*>', ' ', 'g')), 'C') || setweight(to_tsvector('norwegian', regexp_replace(coalesce(content_html, ''), '<[^>]*>', ' ', 'g')), 'C')) STORED
);
--> statement-breakpoint
ALTER TABLE "saved_pages" ADD CONSTRAINT "saved_pages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "saved_pages_user_url_idx" ON "saved_pages" USING btree ("user_id","url");--> statement-breakpoint
CREATE INDEX "saved_pages_user_saved_idx" ON "saved_pages" USING btree ("user_id","saved_at");--> statement-breakpoint
CREATE INDEX "saved_pages_status_idx" ON "saved_pages" USING btree ("status");--> statement-breakpoint
CREATE INDEX "saved_pages_search_idx" ON "saved_pages" USING gin ("search_vector");