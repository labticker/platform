# Worker runtime

One process supports explicit WORKER_ENABLED=true with WORKER_MODE=catalog-poll or mock-pilot.
Supply a reviewed DATABASE_URL and CATALOG_GIT_SHA (7–64 lowercase hexadecimal characters).
Keep EMAIL_DELIVERY_MODE=mock and PUBLIC_EMAIL_ENABLED=false. Run pnpm --filter @labticker/worker dev.
Apply reviewed migrations separately; startup never applies SQL automatically.

Catalog-poll synchronizes reviewed registry metadata, polls sources and refreshes PMF aggregates.
Mock-pilot also prepares and accepts queued digests through the in-process mock gateway. It requires an
exact HTTPS APP_URL, UNSUBSCRIBE_SECRET of at least 32 bytes, and nonempty SENDER_IDENTITY and SENDER_CONTACT.
Use fictional identities in fixtures. Mock messages are not sent to any real recipient or provider.

Catalog synchronization preserves operator pauses, reviewed prior-slug aliases, subscriber IDs and release
history. Source polling uses row locks/SKIP LOCKED. Initial history is backfill; repeat scans preserve its
first-seen/baseline metadata. Conditional cache and generic error state persist. Transient failures back off
exponentially from five minutes to six hours. GitHub intake has an explicit recent-500 history window;
historyLimited and application source status disclose incomplete historical coverage rather than claiming
exhaustive history. GitLab/RSS and the optional selfh.st importer remain unimplemented/disabled.

The durable digest queue locks accounts, persists immutable payload/items, reserves releases already queued,
and records receipts only after acceptance. Empty due windows advance without a message. Backlog is not
silently dropped at 30 days; bounded overflow remains eligible and is reconsidered after one minute.
Claims use lease tokens and fencing. A fresh account/consent/subscription check precedes acceptance.
Cancelled work with firstAttemptAt is quarantined as failed rather than made eligible for blind duplicate
sending. Ambiguous old attempts and exhausted retries require explicit reconciliation. Payload/idempotency
keys stay stable on retries. These guarantees are exercised by local PGlite tests, not a multi-process Neon
or real-provider acceptance run. The mock inbox itself is process-local; it is not a durable email provider.

The loop refreshes 45 complete UTC reporting dates daily for day-30 cohort maturation and late telemetry.
Historical state, not current preferences, determines retention. Shutdown cancels sleep and closes the pool.
Job-run/worker heartbeat persistence, quota governance, identifier retention, reconciliation operations and
actual Fly process health remain deployment prerequisites. Web health still reports workerReady:false.
The Fly preview workflow deploys only the web process; declaring worker does not activate it.

Additional real-PostgreSQL evidence: pnpm test:postgres passed against an empty disposable PostgreSQL 17
container using two independent pools. Concurrent preparation produced one digest; shared-claim dispatch
produced one mock acceptance/receipt; a locked oldest user did not block the next due account. This fixture
requires explicit LOCAL_DB_FIXTURE_ENABLED=true and fixed loopback port 55433, refuses existing public tables,
and must be discarded after use. CI supplies a digest-pinned PostgreSQL service. Neon/cloud acceptance and
real-provider delivery remain distinct gates. Local production-container smoke also verified disabled worker
entry and nonroot runtime; no worker Machine was deployed.
