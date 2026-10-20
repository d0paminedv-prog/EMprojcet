ALTER TABLE "documents" ADD COLUMN "solo_by" uuid;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "solo_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "solo_edited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_solo_by_members_id_fk" FOREIGN KEY ("solo_by") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;