ALTER TABLE "account_state_events" ADD COLUMN "sequence" bigserial NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "account_verification_baseline" ON "account_state_events" USING btree ("user_id") WHERE "event_type" = 'verified_signup';
