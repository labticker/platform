DROP INDEX "digest_window";--> statement-breakpoint
ALTER TABLE "delivery_receipts" DROP CONSTRAINT "delivery_receipts_user_id_release_id_pk";--> statement-breakpoint
ALTER TABLE "delivery_receipts" ADD COLUMN "delivery_mode" text DEFAULT 'mock' NOT NULL;--> statement-breakpoint
ALTER TABLE "delivery_receipts" ADD CONSTRAINT "delivery_receipts_user_id_release_id_delivery_mode_pk" PRIMARY KEY("user_id","release_id","delivery_mode");--> statement-breakpoint
ALTER TABLE "digests" ADD COLUMN "delivery_mode" text DEFAULT 'mock' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "digest_window" ON "digests" USING btree ("user_id","scheduled_for","delivery_mode");--> statement-breakpoint
ALTER TABLE "delivery_receipts" ADD CONSTRAINT "receipt_delivery_mode" CHECK ("delivery_receipts"."delivery_mode" in ('mock','resend'));--> statement-breakpoint
ALTER TABLE "digests" ADD CONSTRAINT "digest_delivery_mode" CHECK ("digests"."delivery_mode" in ('mock','resend'));
