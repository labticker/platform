CREATE TABLE "account_state_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"active_monitor_count" integer NOT NULL,
	"consented" boolean NOT NULL,
	"enabled" boolean NOT NULL,
	"suppressed" boolean NOT NULL,
	CONSTRAINT "account_state_monitor_count" CHECK ("account_state_events"."active_monitor_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "account_state_events" ADD CONSTRAINT "account_state_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_state_history" ON "account_state_events" USING btree ("user_id","occurred_at");