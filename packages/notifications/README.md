# Notifications core

`src/core.ts` provides a network-free mock inbox, deterministic retry identity, release selection, escaped ad-free HTML/plain-text digest composition, exact configured-origin links, signed purpose-limited unsubscribe tokens, and daily/weekly local 09:00 scheduling. No new dependencies are required.

Scheduling uses the runtime IANA timezone database, including DST and fractional offsets. `nextDigestAt` returns a time strictly after its input; persist it as UTC. Tests cover spring DST, weekly fall DST, fractional offsets, suppression/backfill/delivery dedupe and malicious notes. Resume selection can include unseen releases; a durable worker must enforce the documented 30-day resume cap when calculating its input window.

Tokens contain only an opaque internal subject, purpose and expiry. They are signed, not encrypted; never put an email address or other personal data in the subject. GET `/unsubscribe` must only show confirmation; POST must verify the token and immediately suppress the account. The eventual HTTP handler must accept RFC 8058 POST at the URL emitted in List-Unsubscribe. This package alone does not persist suppressions or implement that endpoint.

The mock inbox is fixture-only process memory and makes no provider calls. Send callers must recheck consent/suppression immediately before dispatch and persist immutable payloads, claims, delivery receipts and retry state in PostgreSQL. Mock idempotency is not a replacement for database constraints. The implementation fails closed for any request to enable public email or use a live provider. Real SDK delivery, approved sender verification, signed webhooks and protected activation remain separate work.

Sender identity and contact are mandatory template inputs; placeholder test values are never evidence of legal readiness. No tracking pixels, scripts, advertising, raw HTML notes or external images are emitted. Future sponsor interface remains compiled to no-op.
