CREATE TABLE "analytics_daily_aggregates" (
	"metric_date" date NOT NULL,
	"metric_name" text NOT NULL,
	"dimension_key" text NOT NULL,
	"metric_value" integer NOT NULL,
	"computed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "analytics_daily_aggregates_metric_date_metric_name_dimension_key_pk" PRIMARY KEY("metric_date","metric_name","dimension_key"),
	CONSTRAINT "aggregate_nonnegative" CHECK ("analytics_daily_aggregates"."metric_value" >= 0)
);
--> statement-breakpoint
CREATE TABLE "analytics_report_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	"status" text NOT NULL,
	"source_watermark" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"error_summary" text
);
--> statement-breakpoint
CREATE TABLE "app_aliases" (
	"alias" text PRIMARY KEY NOT NULL,
	"application_id" uuid NOT NULL,
	CONSTRAINT "app_alias_normalized" CHECK ("app_aliases"."alias"=lower(trim("app_aliases"."alias")))
);
--> statement-breakpoint
CREATE TABLE "app_source_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"source_hash" text NOT NULL,
	"git_commit" text NOT NULL,
	"provenance_url" text NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"category" text NOT NULL,
	"homepage_url" text NOT NULL,
	"repo_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "applications_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "auth_accounts" (
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "auth_accounts_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"source_hash" text NOT NULL,
	"git_commit" text NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"previous" jsonb,
	"current" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_receipts" (
	"user_id" uuid NOT NULL,
	"release_id" uuid NOT NULL,
	"digest_id" uuid NOT NULL,
	"resend_id" text NOT NULL,
	"accepted_at" timestamp with time zone NOT NULL,
	CONSTRAINT "delivery_receipts_user_id_release_id_pk" PRIMARY KEY("user_id","release_id")
);
--> statement-breakpoint
CREATE TABLE "digest_items" (
	"digest_id" uuid NOT NULL,
	"release_id" uuid NOT NULL,
	"snapshot" jsonb NOT NULL,
	CONSTRAINT "digest_items_digest_id_release_id_pk" PRIMARY KEY("digest_id","release_id")
);
--> statement-breakpoint
CREATE TABLE "digest_message_engagement" (
	"digest_id" uuid PRIMARY KEY NOT NULL,
	"delivered_at" timestamp with time zone,
	"first_opened_at" timestamp with time zone,
	"first_clicked_at" timestamp with time zone,
	"bounced_at" timestamp with time zone,
	"complaint_at" timestamp with time zone,
	"tracked_open_enabled" boolean DEFAULT false NOT NULL,
	"tracked_click_enabled" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "digests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"window_from" timestamp with time zone NOT NULL,
	"window_to" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"claim_until" timestamp with time zone,
	"idempotency_key" text NOT NULL,
	"resend_id" text,
	"sent_at" timestamp with time zone,
	"last_error" text,
	"next_attempt_at" timestamp with time zone,
	"payload" jsonb,
	CONSTRAINT "digests_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "digests_resend_id_unique" UNIQUE("resend_id"),
	CONSTRAINT "digest_status" CHECK ("digests"."status" in ('pending','claimed','sent','skipped','failed')),
	CONSTRAINT "digest_attempts" CHECK ("digests"."attempt_count" >= 0),
	CONSTRAINT "digest_window_order" CHECK ("digests"."window_to" >= "digests"."window_from")
);
--> statement-breakpoint
CREATE TABLE "email_consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"consent_type" text NOT NULL,
	"policy_version" text NOT NULL,
	"consented_at" timestamp with time zone NOT NULL,
	"source" text NOT NULL,
	"withdrawn_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "job_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_name" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text NOT NULL,
	"counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"frequency" text DEFAULT 'weekly' NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"next_due_at" timestamp with time zone,
	"last_digest_end_at" timestamp with time zone,
	CONSTRAINT "preferences_frequency" CHECK ("preferences"."frequency" in ('daily','weekly'))
);
--> statement-breakpoint
CREATE TABLE "release_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"url" text NOT NULL,
	"external_key" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"etag" text,
	"last_modified" text,
	"last_polled_at" timestamp with time zone,
	"last_ok_at" timestamp with time zone,
	"last_error" text
);
--> statement-breakpoint
CREATE TABLE "releases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"release_source_id" uuid NOT NULL,
	"source_guid" text,
	"dedupe_key" text NOT NULL,
	"tag" text,
	"title" text NOT NULL,
	"release_url" text NOT NULL,
	"notes_text" text NOT NULL,
	"published_at" timestamp with time zone,
	"first_seen_at" timestamp with time zone NOT NULL,
	"is_backfill" boolean DEFAULT true NOT NULL,
	"warning_flags" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resend_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"resend_email_id" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"processing_status" text DEFAULT 'pending' NOT NULL,
	CONSTRAINT "resend_webhook_events_provider_event_id_unique" UNIQUE("provider_event_id")
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"user_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"enabled_at" timestamp with time zone NOT NULL,
	"disabled_at" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "subscriptions_user_id_application_id_pk" PRIMARY KEY("user_id","application_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"email_verified_at" timestamp with time zone,
	"image" text,
	"role" text DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"suppressed_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_email_normalized" CHECK ("users"."email"=lower(trim("users"."email"))),
	CONSTRAINT "users_role" CHECK ("users"."role" in ('user','admin'))
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	CONSTRAINT "verification_tokens_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
ALTER TABLE "app_aliases" ADD CONSTRAINT "app_aliases_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_source_records" ADD CONSTRAINT "app_source_records_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_accounts" ADD CONSTRAINT "auth_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_changes" ADD CONSTRAINT "catalog_changes_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_receipts" ADD CONSTRAINT "delivery_receipts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_receipts" ADD CONSTRAINT "delivery_receipts_release_id_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."releases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_receipts" ADD CONSTRAINT "delivery_receipts_digest_id_digests_id_fk" FOREIGN KEY ("digest_id") REFERENCES "public"."digests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digest_items" ADD CONSTRAINT "digest_items_digest_id_digests_id_fk" FOREIGN KEY ("digest_id") REFERENCES "public"."digests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digest_items" ADD CONSTRAINT "digest_items_release_id_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."releases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digest_message_engagement" ADD CONSTRAINT "digest_message_engagement_digest_id_digests_id_fk" FOREIGN KEY ("digest_id") REFERENCES "public"."digests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digests" ADD CONSTRAINT "digests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_consents" ADD CONSTRAINT "email_consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preferences" ADD CONSTRAINT "preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_sources" ADD CONSTRAINT "release_sources_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "releases" ADD CONSTRAINT "releases_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "releases" ADD CONSTRAINT "releases_release_source_id_release_sources_id_fk" FOREIGN KEY ("release_source_id") REFERENCES "public"."release_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "app_source_identity" ON "app_source_records" USING btree ("provider","external_id");--> statement-breakpoint
CREATE INDEX "auth_accounts_user" ON "auth_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "digest_window" ON "digests" USING btree ("user_id","scheduled_for");--> statement-breakpoint
CREATE INDEX "digests_claim" ON "digests" USING btree ("status","claim_until");--> statement-breakpoint
CREATE INDEX "email_consents_user" ON "email_consents" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "preferences_due" ON "preferences" USING btree ("enabled","next_due_at");--> statement-breakpoint
CREATE UNIQUE INDEX "release_source_identity" ON "release_sources" USING btree ("application_id","provider","external_key");--> statement-breakpoint
CREATE INDEX "release_sources_due" ON "release_sources" USING btree ("enabled","last_polled_at");--> statement-breakpoint
CREATE UNIQUE INDEX "release_dedupe" ON "releases" USING btree ("application_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "releases_recent" ON "releases" USING btree ("application_id","first_seen_at");--> statement-breakpoint
CREATE INDEX "subscriptions_app" ON "subscriptions" USING btree ("application_id");