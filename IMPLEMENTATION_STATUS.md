# Implementation status

Updated 2026-10-31. Every phase remains incomplete until its full acceptance suite runs. Current product is a local mock-email pilot, not a public SaaS launch.

| Phase | Implemented evidence | Remaining acceptance |
|---|---|---|
| 0 | Monorepo, governance/AGENTS, 50 verified GitHub source definitions and validators | Public org/repo, preferred handle allocation, license/security contact decisions, selfh.st absence criterion/20-case spike and vendor analytical calls |
| 1 | Drizzle schema/migrations; lazy PostgreSQL runtime; development-only Auth.js magic links/database sessions; monitor dashboard, consent/preferences, deletion and unsubscribe flows | Public authentication rollout, Neon dev migration/restore checks, production catalog reconciliation and legal review |
| 2 | Safe GitHub adapter and catalog/poll worker mode; locked source intake, cache/error persistence, baseline/rescan dedupe, reviewed rename aliases and admin pause preservation | Adaptive backoff, job-run/health persistence, GitLab/RSS, GitHub histories over 500 releases and multi-process Neon acceptance |
| 3 | DST scheduling and escaped templates; mock gateway/receipts; signed unsubscribe endpoint; signed Resend webhook processing with suppression/replay protection | Durable digest preparation/send queues and leases, reconciliation/retention, auth-message webhook mapping and verified-sender SDK rollout |
| 3A | Cookieless/noop adapter; authoritative state history; historical activation/day30 cohorts; daily aggregate materialization; restricted aggregate API and protected admin page | Enabled PostHog browser privacy acceptance, acquisition/engaged-retention data, production DB role isolation, safe analytical MCP query, quota/retention settings and complete metric dictionary |
| 4 | Secretless PR CI, local production build, mock pipeline and real-browser local auth/monitor/settings checks | Public protected repo/environments, approved actual Fly deployment, Neon restore/migration drill, complete security/load/deployment acceptance |
| 5 | Compiled no-op web/email placements and hostile-configuration tests | Public placement integration and full zero-ad-request/browser acceptance; optional draft campaign management |

## Executed local checks

- 43 automated tests pass: catalog 5, database 4, releases 13, notifications 10, analytics 2, reporting 3, telemetry 3, worker 2, web auth adapter 1.
- Strict typechecks pass across nine packages; eight production build scripts pass; 50 catalog definitions validate.
- PGlite integration applies all migrations, preserves identities/subscriptions/history, verifies constraints, consent/suppression/deletion, signed webhook replay/tracking gates, historical cohorts, aggregate access and release-to-mock-email receipts.
- Browser: fictional magic-link sign-in reached /dashboard; three monitors persisted; daily cadence, America/Edmonton and consent persisted; ordinary admin access denied; aggregate endpoint returned 401 without bearer authorization.
- Initial fixture socket connection limits and browser navigation timing failures were diagnosed before the successful round trip. Local development pools are single-connection/reused across HMR; fixture socket is not Neon/PostgreSQL concurrency proof.
- Production always disables test authentication, even with test flags. First verification timestamps are preserved across repeat login, and deletion preserves pseudonymous cohort membership to prevent survivor bias.
- Incoming request/server-function development logging is disabled; auth diagnostics contain only categorical codes. No public sender, customer email, network advertising or cloud resource was activated.

## Runtime and measurement boundaries

Worker opt-in is WORKER_ENABLED=true plus WORKER_MODE=catalog-poll with a reviewed DATABASE_URL and CATALOG_GIT_SHA. It never applies migrations automatically and refuses public email activation. Source polling uses PostgreSQL row locks/SKIP LOCKED; failure retains old releases and success metadata. Daily reports refresh 45 complete UTC dates for 30-day maturation plus late telemetry. Durable digest sending remains disabled. Health reports preview/mock and workerReady:false.

Historical snapshots serialize account mutations and suppression by user row lock. Activation uses simultaneous three-monitor state in the first seven days of a matured verified cohort; retention uses the state at day 30. Cohorts without an authoritative baseline are explicitly unmeasured. Aggregate readers query only the aggregate table, suppress counts below ten, reject arbitrary parameters/SQL and require independent bearer authorization. Admin UI additionally requires an authenticated admin role. Production database role isolation, scalable query optimization, retention jobs and distributed rate limits remain open.

Webhook verification uses the Resend SDK against the raw bounded body and Svix signature/timestamp headers. Provider event IDs dedupe transactionally; tracking-off events cannot populate open/click metrics; bounce/complaint suppresses future sends and cancels pending/claimed jobs. Unmatched message IDs retry safely rather than discarding acknowledgement races; authentication-message correlation and retry-exhaustion reconciliation are not implemented. No live endpoint registration is claimed.

## Accounts and external gates

Fly CLI 0.5.1, Neon CLI 8.15.1 and Resend CLI 2.26.2 installed. Five official MCP registrations exist outside Git. Fly read-only context call succeeded. Other vendor tools were not exposed in this active session despite recorded OAuth. Neon CLI authenticated/read-only project listing succeeded (empty); Neon MCP had redirect-URI failure. Resend CLI separate API-key login is pending. OAuth status alone is not an analytical test.

GitHub CLI is authenticated, but no public organization/repository was created. Earlier labticker lookup returned 404 without guaranteeing availability/reservation. No Fly slug/hostname is allocated. No purchased domain, custom DNS, production resource or payment was made. selfh.st importer remains disabled pending verified permissions/export contract. Live email requires a separate owner-controlled verified sender; fly.dev hosting is insufficient.

Owner interaction remains required for organization/vendor account setup, license/legal/security-contact choices, scoped protected-environment credentials, billable-resource budget approval and verified-sender/live-send approval. Local development does not require these approvals.

See docs/LOCAL_RUNTIME.md, docs/CORE_ACCEPTANCE.md, docs/OPERATIONS.md and package READMEs for reproducible checks and remaining limits.
