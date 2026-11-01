CREATE TABLE "auth_email_messages" (
	"provider_id" text PRIMARY KEY NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL
);
