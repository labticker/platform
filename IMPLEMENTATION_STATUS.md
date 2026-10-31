# Implementation status

Updated 2026-10-30. Every phase remains incomplete until its full acceptance suite executes. The application is a local product preview with mock delivery; no production launch or cloud provisioning is claimed.

| Phase | Current evidence | Outstanding acceptance |
|---|---|---|
| 0 — foundation/catalog | pnpm/Turborepo, strict TypeScript, governance/AGENTS, 50 official GitHub stable-release source checks and validated JSON definitions | Explicit not-on-selfh.st membership verification, representative 20-case ingestion spike, approved handle allocation, vendor test calls, governance/license activation |
| 1 — product/database | Branded searchable catalog/provenance preview; generated 21-table Drizzle PostgreSQL migration; isolated PGlite identity/history preservation checks | Runtime authentication, Neon migration testing, database-backed monitor dashboard/settings, production catalog reconciliation and source merge orchestration |
| 2 — releases | GitHub stable-release adapter, bounded conditional fetch/pagination, DNS/redirect defenses, conservative classification and normalization tests; live linkding smoke returned 92 stable releases | Durable polling jobs, persisted source health/backoff, GitLab/RSS adapters, restart and concurrency acceptance |
| 3 — digests | Daily/weekly DST scheduling, consent/suppression/backfill/receipt selection, signed unsubscribe token helpers, escaped ad-free composition, deterministic mock gateway; offline release-to-PostgreSQL-to-mock-receipt integration | Runtime scheduler/leases/retries, consent and unsubscribe HTTP flows, signed Resend webhooks, live SDK delivery and separate verified-sender rollout |
| 3A — measurement | Noop/PostHog adapters, route/event sanitization and disabled/DNT/opt-out tests; privacy explanation | Enabled-provider browser privacy checks, authoritative Neon PMF aggregation, aggregate-only access controls/API, admin dashboard, safe PostHog analytical query and retention/quota setup |
| 4 — delivery | Secretless PR CI definition; local build/typechecking and preview browser smoke; mock pipeline integration | Public org/repo and protected environments, approved actual Fly hostname/deployment, Neon development migration/restore drill, security/load/E2E acceptance and rollback proof |
| 5 — dormant advertising | Compiled no-op web/email placement interfaces and hostile-configuration tests | Public placement/browser integration and complete zero-ad-network acceptance; optional draft-only campaign persistence/admin controls |

## Executed evidence and limits

Final root verification after the privacy/review corrections passed: strict TypeScript checks across seven packages, all six configured build scripts, 50 catalog definitions and 33 tests (catalog 5; releases 13; database 2; notifications/dormant placements 10; analytics 2; worker integration 1). Authored modifications also passed git diff --check. These results establish local core evidence only; full phase acceptance remains outstanding.

Database tests apply the generated PostgreSQL migration locally, verify repeat migration safety, preserve IDs/subscriptions/releases across catalog renames, and reject identity/alias collisions, blank maintained metadata, duplicate releases/receipts/webhooks/digest windows and invalid constraints. Cross-provider identity linking and field precedence orchestration require reviewed mapping; they are not silently inferred from names.

Root browser smoke found one Immich catalog result after search, with no cookies/localStorage created, no ad requests and only local static requests in noop analytics mode. This smoke preceded the latest privacy-control addition; the opt-out control itself was not clicked/tested in that browser run. The health endpoint honestly reports preview status, mock email and workerReady:false. This does not prove enabled PostHog network privacy, runtime authentication, scheduler health or production readiness. The live GitHub adapter smoke is separate from fixture-based tests; its observed release count is time-dependent.

Catalog verification evidence is in catalog/verification.json and catalog/VERIFICATION.md. selfh.st reuse permissions/current export contract remain unresolved, so its importer is disabled. No upstream artwork or descriptions are assumed reusable.

## Accounts, tooling and external gates

Git, Node, pnpm, GitHub CLI and Codex are installed. Fly CLI 0.5.1, Neon CLI 8.15.1 and Resend CLI 2.26.2 were installed and version-checked. Five official MCP registrations exist globally outside Git. Fly MCP is now exposed and a read-only context call succeeded. GitHub, Neon, Resend and PostHog MCP tools are not exposed in this active session despite the recorded registrations/authentication; do not claim successful analytical/vendor tool calls from OAuth status alone.

GitHub CLI is authenticated. Fly, PostHog and Resend MCP OAuth were recorded as configured. Neon CLI authenticated through the Windows keyring and a read-only project list returned empty. Neon MCP failed token exchange with Invalid redirect URI; the CLI fallback remains available. Resend CLI separately requires an API key in its non-interactive login and remains pending. See docs/LOCAL_TOOLING_SETUP.md for setup history and scope restrictions. No secrets are recorded here.

GitHub users/labticker returned 404, which is not a guarantee of availability or ownership. No public organization/repository or Fly app is claimed created. Fly slug allocation remains unconfirmed; APP_URL/AUTH_URL must use the actual assigned hostname. No cloud resources, billable services, domain purchases, DNS changes, public releases or real emails were created by this work.

Owner setup still required: final license/legal terms and private security contact; approved organization/account setup; quota and budget review before any billable resource; protected production environments/reviewers and scoped credentials; an owner-controlled verified sender domain before public auth/digests. No domain purchase is required for Fly web readiness. Advertising stays off independently of analytics. Production subscriber data must never be exposed to Neon MCP; Codex reporting is aggregate-only.

Reproduction commands and module boundaries: docs/CORE_ACCEPTANCE.md.
