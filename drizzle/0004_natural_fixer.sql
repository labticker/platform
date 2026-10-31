ALTER TABLE "digests" ADD COLUMN "lease_token" uuid;--> statement-breakpoint
ALTER TABLE "digests" ADD COLUMN "first_attempt_at" timestamp with time zone;