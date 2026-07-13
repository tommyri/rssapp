CREATE TABLE "item_labels" (
	"label_id" bigint NOT NULL,
	"item_id" bigint NOT NULL,
	CONSTRAINT "item_labels_label_id_item_id_pk" PRIMARY KEY("label_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "labels" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "labels_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" bigint NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_page_labels" (
	"label_id" bigint NOT NULL,
	"saved_page_id" bigint NOT NULL,
	CONSTRAINT "saved_page_labels_label_id_saved_page_id_pk" PRIMARY KEY("label_id","saved_page_id")
);
--> statement-breakpoint
ALTER TABLE "item_labels" ADD CONSTRAINT "item_labels_label_id_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."labels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_labels" ADD CONSTRAINT "item_labels_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labels" ADD CONSTRAINT "labels_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_page_labels" ADD CONSTRAINT "saved_page_labels_label_id_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."labels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_page_labels" ADD CONSTRAINT "saved_page_labels_saved_page_id_saved_pages_id_fk" FOREIGN KEY ("saved_page_id") REFERENCES "public"."saved_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "item_labels_item_idx" ON "item_labels" USING btree ("item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "labels_user_name_idx" ON "labels" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "saved_page_labels_page_idx" ON "saved_page_labels" USING btree ("saved_page_id");