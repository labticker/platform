# Worker runtime

One process supports explicit WORKER_ENABLED=true with WORKER_MODE=catalog-poll or mock-pilot. Supply a
reviewed DATABASE_URL and CATALOG_GIT_SHA (7–64 lowercase hexadecimal characters). Keep EMAIL_DELIVERY_MODE=mock
and PUBLIC_EMAIL_ENABLED=false. Run pnpm --filter @labticker/worker dev after separately reviewed migrations;
startup never applies SQL automatically.

Catalog-poll syncs reviewed registry metadata, polls sources and refreshes PMF reports. Mock-pilot also prepares
and accepts queued digests through the in-process mock gateway. It requires an exact HTTPS APP_URL, a >=32-byte
UNSUBSCRIBE_SECRET, and nonempty SENDER_IDENTITY/SENDER_CONTACT. Fixture identities must be fictional. No runtime
path selects the dormant Resend SDK adapter or sends a real message.

Registry sync preserves pauses, reviewed rename aliases, subscriber IDs and release history. Polls use row locks
and SKIP LOCKED; initial history stays backfill and rescans preserve first-seen metadata. Cache/error state persists.
Transient errors back off from five minutes to six hours. Recent-500/historyLimited flags disclose bounded GitHub
coverage. GitLab/RSS, deeper history/cursor policy and optional selfh.st import remain unimplemented/disabled.

The durable digest queue serializes account mutations, persists immutable payload/items and reserves already
queued releases. Receipts are written only after acceptance. Empty due windows advance; normal backlog is not
silently dropped at 30 days and bounded overflow is reconsidered after one minute. Leases are fenced, with fresh
consent/suppression/deletion/subscription checks before dispatch. Cancellation after a possible attempt and old
ambiguous/exhausted attempts are quarantined for reconciliation. Retries keep payload/key stable. The mock inbox
is process-local, not a durable provider; its acceptance does not prove real-provider delivery semantics.

Worker ticks persist start/completion/failure timestamps and allowlisted integer counts. A crash leaves an
observable running row; failures retain a fixed category rather than raw provider/SQL/recipient text. Protected
/admin/operations shows queue totals, safe jobs and tick freshness; ticks older than 30 minutes are stale. The
/admin/sources controls require an administrator/current reviewed registry mapping and preserve data. These
screens are operational diagnostics, not production acceptance. Public health still reports workerReady:false.

Reports bootstrap 90 complete UTC dates per process, then refresh 45 daily for maturity and late telemetry.
Rolling activation/retention rates shift signup dates seven/thirty days behind their maturity-date windows,
including matched prior periods. Missing history is unmeasured, never invented. Source gauges are observed after
polling, not backfilled from current mutable state. A history-coverage warning does not count as a fetch failure.
Shutdown cancels sleep and closes the pool.

Local PGlite suites exercise polling/queue/operational persistence. Separate disposable PostgreSQL17 acceptance
uses two independent pools to check concurrent preparation/shared-claim acceptance and progress past a locked
oldest account. Run pnpm test:postgres only with LOCAL_DB_FIXTURE_ENABLED=true on an empty fixed-loopback fixture
at port55433; CI supplies a digest-pinned service. This is not Neon, cloud worker or real-provider acceptance.

Production still requires quota/identifier-retention governance, reconciliation operations, Neon restore/migration,
protected rollout and real Fly process health. The preview workflow targets web only; declaring a worker process
does not activate a Machine. The prior local image from eb14c15 passed disabled-worker/nonroot smoke; current
increment image acceptance is pending. No worker Machine, paid resource or live sender was created.
