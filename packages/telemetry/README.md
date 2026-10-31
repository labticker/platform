# Signed Resend webhook ingestion

`verifyResendWebhook` uses the official Resend SDK on the exact raw body and Svix headers. Its verifier checks the cryptographic signature and timestamp freshness. `readWebhookBody` limits actual streamed bytes to 256 KiB, independent of Content-Length. Verification never sends an email or calls a vendor API.

`processResendEvent` deduplicates event IDs transactionally, correlates provider message IDs only with registered digest sends, records the earliest per-message delivery/engagement times, and suppresses the user plus disables preferences and withdraws digest consent on bounce/complaint. A state-history snapshot is written in the same transaction. Opens and clicks are accepted only when their respective per-message persisted tracking flag is enabled; both default off. Opens remain unreliable estimates and clicks may include scanners.

Only message/event identifiers, event type, timestamps and processing state are retained. Recipient arrays, raw payloads, release links and IP metadata are discarded. Access to these tables is operational and restricted; AI reporting must use aggregate tables only.

An event racing the send acknowledgement rolls back and returns a retryable error; the HTTP route responds 503 so provider retries can correlate later. A known event with an unregistered message ID is not silently acknowledged. Before live sending, add provider reconciliation and alerting for retries exhausted or deleted accounts, prune event identifiers under the approved short-retention policy, and exercise webhook registration against the actual deployed origin. Authentication messages need their own explicit non-digest mapping if processed through this endpoint.

The route at `POST /api/webhooks/resend` fails closed without DATABASE_URL and RESEND_WEBHOOK_SECRET. It uses fixed responses without private data or exception logs. No endpoint registration or live provider event was performed.

Run `pnpm --filter @labticker/telemetry test` for real-signature fixtures, mutation/stale replay rejection, body limits, database dedupe, out-of-order retry, opt-in tracking, suppression and PII omission. Tests use PGlite and synthetic secrets only.

Official verification contract: https://resend.com/docs/webhooks/verify-webhooks-requests
