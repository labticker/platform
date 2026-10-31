# Worker runtime

The single worker supports `WORKER_ENABLED=true` plus `WORKER_MODE=catalog-poll`.
Supply a reviewed `DATABASE_URL` and `CATALOG_GIT_SHA` (7–64 lowercase hexadecimal Git revision).
Keep `EMAIL_DELIVERY_MODE=mock` and `PUBLIC_EMAIL_ENABLED=false`. Run `pnpm --filter @labticker/worker dev`.
Apply reviewed migrations locally/development first; startup never applies SQL automatically.

Daily registry sync and hourly source eligibility run in a sequential minute loop. PostgreSQL source
row locks with SKIP LOCKED serialize bounded HTTP and insertion. Initial history is backfill; rescans
preserve first-seen/baseline metadata. Success/cache and generic failure state persist. Source failures
retry on the next hourly window. Adaptive exponential backoff and durable job-run history remain pending.

The loop refreshes the last 45 complete UTC aggregate dates daily. This covers day-30 cohort maturation
and 14 additional days of delayed email telemetry. Reports use first-party historical snapshots, never
today's preferences as a substitute for day-30 state. The reporting reader cannot query raw accounts.

This mode does not send digests. Durable digest queues, lease fencing, reconciliation, graceful shutdown
draining and worker-health reporting remain deployment prerequisites. Web health reports workerReady:false.
GitHub history exceeding 500 releases fails closed pending cursor policy. GitLab/RSS and selfh.st remain disabled.
Local PGlite tests do not prove multi-process Neon locking, deployment, backup or sender readiness.
