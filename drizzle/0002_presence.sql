CREATE TABLE "presence" (
	"tab_id" text PRIMARY KEY NOT NULL,
	"member_id" uuid NOT NULL,
	"state" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"changed_at" timestamp with time zone,
	"gone_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "presence" ADD CONSTRAINT "presence_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "presence_updated_idx" ON "presence" USING btree ("updated_at");