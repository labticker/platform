ALTER TABLE "release_sources" ADD COLUMN "failure_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "release_sources" ADD COLUMN "next_poll_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "release_sources" ADD COLUMN "history_limited" boolean DEFAULT false NOT NULL;