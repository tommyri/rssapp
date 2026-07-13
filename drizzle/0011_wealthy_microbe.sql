ALTER TABLE "rules" ADD COLUMN "label_id" bigint;--> statement-breakpoint
ALTER TABLE "rules" ADD CONSTRAINT "rules_label_id_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."labels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rules_label_idx" ON "rules" USING btree ("label_id");