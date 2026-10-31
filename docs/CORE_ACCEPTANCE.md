# Local acceptance

Passing these checks does not accept an entire phase or authorize deployment, public sending or advertising.
Use Node 22.23.3 and pnpm 10.30.3. From the monorepo root:

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm catalog:validate
pnpm build
```

No production credentials, vendor MCP, external database or email account is needed. Tests use local PGlite,
fixture transport and injected SDK calls. Registry access is needed only to install pinned dependencies.

## Current evidence

Root reports 60 tests: catalog 5, database 4, releases 13, notifications 16, analytics 3, reporting 3,
telemetry 3, worker 12 and web auth adapter 1. Nine package typechecks, eight build scripts and 50 catalog validations passed. The final analytics correction passed affected strict/test checks, and all three analytics tests passed inside the final rebuilt Linux container.
Treat its final recorded result as the final evidence. No full phase is complete.

## Module map

| Module | Acceptance scope | Focused test |
|---|---|---|
| packages/catalog | JSON/runtime contracts, source definitions and static URL safety | pnpm --filter @labticker/catalog test |
| packages/database | Migrations, constraints, identity/account history and consent | pnpm --filter @labticker/database test |
| packages/releases | GitHub contracts, safe fetch, recent-history disclosure and advisory labels | pnpm --filter @labticker/releases test |
| packages/notifications | DST, templates/tokens, mock gateway, dormant SDK guards/errors and zero ads | pnpm --filter @labticker/notifications test |
| apps/worker | Polling and durable mock queue, claims/fencing/retry/suppression/receipts | pnpm --filter @labticker/worker test |
| packages/analytics | Sanitized routes/events and disabled/DNT/opt-out modes | pnpm --filter @labticker/analytics test |
| packages/telemetry | Real local webhook signatures, dedupe, tracking gates and suppression | pnpm --filter @labticker/telemetry test |
| packages/reporting | Historical cohorts, aggregates-only reader/auth/thresholds | pnpm --filter @labticker/reporting test |
| apps/web | First verification timestamp preserved across later logins | pnpm --filter @labticker/web test |

Generate reviewed migrations with pnpm --filter @labticker/database generate. Generation does not apply
SQL remotely. Local tests migrate isolated PGlite stores; managed Neon migration/concurrency/restore remain
separate acceptance. Durable queue tests cover persisted payload retries, lease fencing, acceptance-only
receipts, empty windows, suppression/cancellation quarantine, frequency changes, overflow and deduplication.
No provider API request or real message is made by these tests. SDK tests inject the transport and require
explicit sender/owner/domain gates; credentials alone do not enable live sending.

Browser setup is in docs/LOCAL_RUNTIME.md. Observed local acceptance includes fictional magic-link sign-in,
three monitors, persisted cadence/timezone/consent, ordinary-admin denial and unauthenticated aggregate 401.
Earlier public-preview smoke showed no analytics/ad requests or storage in noop mode. Enabled PostHog
requires its own production-mode browser storage/payload/replay/consent checks; noop evidence cannot prove it.

## External acceptance still required

No actual Fly deployment, protected public repository/environment setup, Neon dev migration/restore drill,
live sender or real email registration/send has been proven. Deployment preparation
includes protected manual Actions, migration/backup references, source-based runtime image and web-only
Fly preview targeting. Docker engine 29.9.2 built and smoke-tested a Linux image locally. The final digest-pinned/telemetry-disabled image rebuilt successfully from code revision eb14c15 and passed production-container smoke checks. Actual Fly runtime behavior remains unverified.

Keep public sending off until reviewed verified sender ownership, consent/unsubscribe, identity/contact,
webhook auth-message correlation, quotas, retention/reconciliation, authorized recipient tests and protected
activation. Never infer sender verification from fly.dev web hosting. The runtime mock-pilot does not select
the dormant Resend adapter. Analytics and metric thresholds never activate advertising or declare PMF.

## Disposable PostgreSQL concurrency acceptance

This is separate from the 60 unit/integration tests. Start a fresh trusted PostgreSQL 17 container with its
port bound exclusively to 127.0.0.1:55433 and an empty database. The fixture uses local trust authentication;
never bind it publicly or attach production data. Set LOCAL_DB_FIXTURE_ENABLED=true and run pnpm test:postgres.
The script refuses production mode and any pre-existing public tables, applies migrations and writes fictional
records. It uses two independent pools to prove one concurrent preparation, one acceptance/receipt for a shared
claim and SKIP LOCKED progress past a locked oldest account. Discard the container afterward; rerunning against
its populated database must fail. CI provisions a digest-pinned disposable PostgreSQL service for this command.
No DATABASE_URL or production secret is accepted by this fixture; it targets only the fixed loopback port.

Local image acceptance built labticker:local-acceptance and checked the production container's catalog of 50,
mock/workerReady:false health, disabled public sign-in, mock inbox 404 and aggregate API 401, nonroot UID 1000
and disabled worker entry. The final digest-pinned image with Next/Turbo telemetry disabled rebuilt successfully from code revision eb14c15 and repeated all smoke checks; its three analytics tests passed inside the container. Both named test containers were stopped/removed, retaining only the local acceptance image.
These checks do not establish Neon backups, live sender readiness or a Fly deployment.

Analytics transport regression coverage preserves PostHog's required public project token while removing
identifying properties and top-level $set/$set_once. Resend MCP read-only quota/domain calls now succeeded
(100/day, 3000/month; one verified account domain observed without recording its private name). Project
sender selection and owner activation remain pending; no send/resource mutation occurred. PostHog tooling
is listed, but a transport failure prevented a successful learning/analytical call; analytics query acceptance
is still outstanding. The final image rebuild includes the analytics transport correction.
