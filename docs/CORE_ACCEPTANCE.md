# Local acceptance

Passing local checks does not complete an entire phase or authorize deployment, public email, spending or advertising.
Use Node 22.23.3 and pnpm 10.30.3 from the monorepo root:

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm catalog:validate
pnpm build
```

Tests use local PGlite, fixture transports and injected SDK boundaries; no production credential or sender is needed.
The current verified count is 73: catalog5, database7, releases13, notifications16, analytics6, reporting8,
telemetry3, worker13 and web2. All nine package typechecks and 50 catalog definitions pass. Disposable
PostgreSQL concurrency acceptance passes after the bounded queue SQL change. Fresh Linux image build and production-browser analytics acceptance pass (see below).

| Module | Acceptance scope |
|---|---|
| packages/catalog | Versioned JSON/runtime contracts and source definitions |
| packages/database | Migrations, identity/account history, source admin authorization and operational counts |
| packages/releases | GitHub contracts, fetch-time network defenses, bounded-history disclosure and labels |
| packages/notifications | DST/templates/tokens, mock delivery, dormant SDK gates/timeouts and zero advertising |
| apps/worker | Polling, durable queue claims/retries/fencing/suppression/receipts and job-run persistence |
| packages/analytics | Actual SDK payload sanitizer, safe acquisition, storage/DNT/opt-out behavior |
| packages/telemetry | Signed raw webhook verification, replay protection, tracking gates and suppression taxonomy |
| packages/reporting | Mature-cohort windows, exact denominator/date semantics, source gauges and aggregate-only privacy |
| apps/web | Authentication cohort invariance and protected administrative boundaries |

Run a focused suite with pnpm --filter @labticker/<package> test. Generate reviewed schema changes with
pnpm --filter @labticker/database generate; generation never applies SQL remotely. Use docs/LOCAL_RUNTIME.md
for the disposable loopback database and development-only mock sign-in. Production always rejects that provider.

## Browser and analytics evidence

Local browser flow passed fictional magic-link sign-in, three monitors, cadence/timezone/consent persistence,
ordinary admin denial and unauthenticated reporting 401. The actual PostHog SDK was also exercised through
intercepted fixture transport: two intended captures yielded two intercepted requests, zero analytics cookies
or localStorage and no PII payload. DNT and explicit opt-out suppressed tracking. Acquisition values are coarse
allowlisted categories. Noop-only evidence is not used to claim this enabled-SDK behavior.

This still does not prove a real PostHog project's cookieless settings, ingestion, region/retention, quota or
MCP analytical query. Nor does it prove live email tracking/domain configuration. Opens remain estimates;
tracking and advertising are independent and advertising stays disabled.

## Queue, operations and PMF semantics

Queue tests cover persisted payload/key reuse, acceptance-only receipts, expired claims/fencing, ambiguous
retries/quarantine, empty windows, frequency/selection changes, overflow and suppression races. SDK tests never
make an API request. The runtime remains MockEmailGateway only. Job starts/results persist with safe counts
and generic failures; /admin/operations is role-protected and marks ticks stale after 30 minutes. Source
pause/resume requires admin authorization and a current reviewed registry mapping.

Reporting bootstraps 90 complete dates, then refreshes 45. Activation and day30 retention compare fully mature
signup windows shifted seven/thirty days behind their displayed rolling maturity-date windows. Prior periods
use matching shifts. Exact cohort dates, computation timestamp ranges and denominators are reported. Missing
watermarks or incomplete maturity coverage are unavailable, never zero. Flow counts retain calendar dates.

Coverage uses nonempty scheduled digest cohorts; delivery/open/click/bounce/complaint use acceptance-date cohorts.
Explicit unsubscribe/consent withdrawal is separated from provider suppression and unknown old history. The
multiday unsubscribe rate is an observed account-day rate. Source snapshots are observed current state, never
reconstructed history; a limited-history warning is not a fetch failure. AI reports suppress small cells and
require visible complete pairs; the separately protected owner aggregate helper can show legitimate zero rates
with denominator>=10. There is no HTTP owner/audience override or raw subscriber query interface.

## Disposable PostgreSQL concurrency

This fixture is separate from the verified73 automated tests. Start an empty trusted PostgreSQL17 container,
bind exclusively to 127.0.0.1:55433, set LOCAL_DB_FIXTURE_ENABLED=true and run pnpm test:postgres. It refuses
production mode/pre-existing public tables, migrates the empty database and uses fictional records/two pools.
It tests one concurrent preparation, one acceptance/receipt for a shared claim and progress past a locked
oldest account. CI uses a digest-pinned disposable PostgreSQL service. Discard the container after use.
This proves local PostgreSQL behavior, not Neon migration, backups, restore or provider reconciliation.

## Image and external acceptance

The previously accepted digest-pinned Linux image from code revision eb14c15 passed production-container
checks: 50 catalog entries, mock/workerReady:false health, public auth disabled, mock inbox404, reporting401,
nonroot UID1000 and disabled worker entry; its three then-current analytics tests also passed. Docker engine
29.9.2 built that image. Named test containers were removed, retaining only the local image. The current image also passes all eight build scripts, UID1000, mock health and disabled-worker smoke. Actual production application browser acceptance passes: one coarse search event, one filter event, two pageviews, community acquisition, zero analytics storage and secure opt-out preventing further vendor calls. Every vendor request was intercepted locally; no real ingestion occurred. Browser/container were closed afterward.

No actual Fly deployment or protected public organization/repository setup has run. Owner organization/license
answers are pending. Live sender selection/approval, auth-message webhook correlation, quota/retention policy,
ambiguous-send reconciliation, Neon dev migration/restore, protected deployment, broader security/load and
real PostHog/MCP checks remain distinct gates. No cloud resources, paid resources or real sends were created.
