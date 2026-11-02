CREATE TABLE "email_test_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"first_attempt_at" timestamp with time zone,
	"claim_until" timestamp with time zone,
	"lease_token" uuid,
	"next_attempt_at" timestamp with time zone,
	"provider_id" text,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"bounced_at" timestamp with time zone,
	"complained_at" timestamp with time zone,
	CONSTRAINT "email_test_messages_provider_id_unique" UNIQUE("provider_id"),
	CONSTRAINT "email_test_status" CHECK ("email_test_messages"."status" in ('pending','claimed','sent','failed','skipped')),
	CONSTRAINT "email_test_attempts" CHECK ("email_test_messages"."attempt_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "email_test_messages" ADD CONSTRAINT "email_test_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "email_test_request" ON "email_test_messages" USING btree ("user_id","request_id");--> statement-breakpoint
CREATE INDEX "email_test_claim" ON "email_test_messages" USING btree ("status","claim_until");--> statement-breakpoint
CREATE INDEX "email_test_limits" ON "email_test_messages" USING btree ("created_at","user_id");--> statement-breakpoint
CREATE FUNCTION protect_email_test_message() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.payload IS DISTINCT FROM OLD.payload OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.request_id IS DISTINCT FROM OLD.request_id OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
  RAISE EXCEPTION 'Email test message identity and payload are immutable';
 END IF;
 RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER email_test_message_immutable BEFORE UPDATE ON email_test_messages FOR EACH ROW EXECUTE FUNCTION protect_email_test_message();
