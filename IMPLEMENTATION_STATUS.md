# Implementation status

Updated 2026-10-31. All phases remain incomplete until their full acceptance suites run. This is a local mock-email pilot; no public SaaS launch, paid resource, cloud deployment, live email or advertising activation is claimed.

| Phase | Implemented evidence | Remaining acceptance |
|---|---|---|
| 0 | Monorepo/governance, 50 verified GitHub catalog definitions and validators | Owner organization/license decisions, public protected repo, actual handle allocation, selfh.st absence criterion/20-case spike and analytical vendor queries |
| 1 | Local Auth.js/database sessions; monitors, consent/settings, unsubscribe/deletion; reviewed migrations; admin role checks | Public authentication/sender rollout, Neon migration/restore, legal disclosures and protected production setup |
| 2 | Locked GitHub polling, conditional cache, exponential backoff, baseline/rescan dedupe, recent-500 coverage disclosure; protected source pause/resume controls | GitLab/RSS, deeper history/cursor policy, cloud source-health and Neon concurrency acceptance |
| 3 | Durable fenced mock queue, immutable retry payloads, acceptance-only receipts, signed unsubscribe/webhooks; dormant SDK adapter | Provider quota/retention/reconciliation, auth-message webhook mapping, authorized sender tests and live SDK activation |
| 3A | Real SDK browser privacy fixture; sanitized acquisition; state history; mature-cohort rolling PMF reports; observed source gauges; separate owner/AI aggregate readers | Actual PostHog project ingestion/MCP query, engaged retention, production role isolation, retention/quota policy and full launch privacy acceptance |
| 4 | Pinned secretless CI, protected deployment preparation, local PostgreSQL concurrency fixture and prior Linux-container smoke | Current-image acceptance, public protected repository/environments, approved actual Fly hostname, Neon restore/migration and complete security/load/rollback checks |
| 5 | Compiled no-op website/email placements and hostile-configuration tests | Full eligible public-placement/browser acceptance and optional draft-only campaign management |

## Validation evidence

The current increment passes 73 automated tests: catalog 5, database 7, releases 13, notifications 16, analytics 6, reporting 8, telemetry 3, worker 13 and web 2. All nine package typechecks, 50 catalog definitions and disposable PostgreSQL concurrency checks pass. The fresh digest-pinned Linux image builds all eight scripts and passes nonroot, mock-health and disabled-worker smoke. Production application browser acceptance passes with all vendor traffic intercepted locally: one coarse search event, one filter event, two pageviews, community acquisition, zero analytics storage and secure-cookie opt-out with no further vendor calls. No real ingestion occurred. Queue SQL applies exclusions before LIMIT 101 and projects only 600-character note excerpts; full source notes remain retained.

Prior accepted baseline: 60 automated tests, nine package typechecks, eight build scripts, 50 catalog definitions, a frozen lockfile install and actual disposable PostgreSQL 17 concurrency checks. A digest-pinned Linux image built from code revision eb14c15 passed production-container smoke and its three analytics tests. That older image does not prove the current increment. Root is preparing a fresh build.

Browser evidence now includes the actual PostHog SDK under intercepted fixture transport: two intended captures produced two intercepted requests, with zero analytics cookies/localStorage, no PII payload, and DNT/opt-out suppression. Acquisition uses allowlisted coarse categories rather than arbitrary URL/query values. This proves local transport behavior, not ingestion into a real analytics project or a successful MCP analytical query. Existing local browser checks also passed fictional magic-link sign-in, three monitors, persisted cadence/timezone/consent, regular-user admin denial and unauthenticated aggregate 401.

PGlite checks cover migration/identity/history preservation, account authorization, suppression/deletion, queue fencing/retry/receipts, signed webhook replay/tracking gates and PMF completeness/privacy. The separate disposable PostgreSQL fixture uses two independent pools to test concurrent preparation/acceptance and progress past a locked oldest account; it is not Neon or provider delivery proof. No fixture contains subscriber data.

## Runtime and operations

Worker opt-in is WORKER_ENABLED=true with catalog-poll or mock-pilot, reviewed DATABASE_URL and CATALOG_GIT_SHA. Mock-pilot also requires exact HTTPS APP_URL, a >=32-byte UNSUBSCRIBE_SECRET and sender identity/contact. EMAIL_DELIVERY_MODE must be mock and PUBLIC_EMAIL_ENABLED false. Startup never applies SQL automatically. The runtime never selects the dormant Resend adapter.

Worker ticks now persist a start row, allowlisted integer counts, completion/fixed failure category and timestamps. A crash leaves an observable running row. Protected /admin/operations shows queue totals and tick status; a tick older than 30 minutes is stale. This is operational freshness, not production acceptance. Source controls require an authenticated administrator and reviewed registry identities; they preserve subscribers and release history. Public health remains preview/mock with workerReady:false.

Polling uses PostgreSQL row locks/SKIP LOCKED, five-minute-to-six-hour failure backoff, ETag/Last-Modified and explicit historyLimited status for recent-500 coverage. Operator pauses survive registry synchronization. The durable queue rechecks consent, suppression, deletion and monitor selections before acceptance; payload/key remain stable and receipts are written only after acceptance. Empty windows advance; bounded overflow retries without dropping normal backlog. Old ambiguous/exhausted attempts and cancellation after a possible dispatch require reconciliation. The mock provider inbox is process-local, not a durable email provider.

## Measurement definitions and privacy

Reports bootstrap 90 complete UTC dates, then refresh 45 daily. Rolling activation rates shift signup windows back seven days; retention shifts them thirty days, for current and adjacent prior periods alike. Every paired signup day must be fully mature at its recorded watermark. Reports expose exact metric/cohort dates, maturity lag, computation timestamp range and visible numerator/denominator. Missing or insufficient coverage is unavailable, never zero. Calendar flow counts remain unshifted.

Explicit unsubscribe_completed and digest_consent_withdrawn events are separate from email_bounced/email_complained. Generic historical suppressed events remain unclassified. The unsubscribe rate uses observed at-risk account-days. Delivery metrics use acceptance-date cohorts; coverage uses accepted nonempty intents from the same scheduled-date cohort. Source freshness is a current observed gauge: success within four hours; failing requires failureCount>0, so limited-history warnings are not failures. Source state is never backfilled from today's mutable rows.

Both report paths query only precomputed aggregates. The bearer-authenticated AI API rejects raw/arbitrary parameters, applies small-cell suppression, and provides rates only with complete visible pairs. Period totals are aggregated before thresholding. The separately authenticated admin helper may show small/zero owner counts and zero-numerator rates with denominator>=10; no HTTP audience override exposes this helper. Opens remain unreliable estimates and clicks may include scanners. Analytics never declares PMF or activates advertising.

## External gates

GitHub CLI is authenticated; no public LabTicker organization/repository was created. Owner organization/license questions remain pending. Earlier labticker lookup returned 404 without guaranteeing availability. No Fly slug or hostname is allocated. Five MCP registrations exist; Fly read-only context and Resend quota/domain inspection succeeded. One account sender domain was observed as verified without publishing its private name; selecting a LabTicker sender and authorizing sends remain separate. PostHog transport/analytical acceptance is unresolved; Neon CLI listing succeeded empty, while Neon MCP had a redirect-URI failure.

No domain was purchased, DNS changed, cloud resource allocated or real email sent. selfh.st import remains disabled pending verified rights/contracts. fly.dev web hosting is not Resend sender verification. Protected provisioning/deploy workflows are prepared, with preview targeting web only; actual environment protections, scoped credentials, billing approval, production migrations/backups and rollout still require owner action.

See docs/CORE_ACCEPTANCE.md, docs/LOCAL_RUNTIME.md, docs/DEPLOYMENT_PREPARATION.md, docs/OPERATIONS.md and package READMEs.
