# Local runtime acceptance

No cloud account, Docker daemon, verified email domain or payment is needed for these checks.
Use fictional addresses at example.com or example.invalid. Never load subscriber data into this fixture.

Install pinned dependencies with `pnpm install --frozen-lockfile`. In one PowerShell terminal:

```powershell
$env:LOCAL_DB_FIXTURE_ENABLED='true'
pnpm dev:fixture-db
```

This applies reviewed migrations to an in-memory PGlite instance, seeds three Git-tracked applications,
and binds its unauthenticated development socket exclusively to 127.0.0.1:55432. Closing it discards data.
The socket permits multiple connections but does not establish real PostgreSQL concurrency semantics.
The development runtime reuses a global pool and limits local database pools to one connection to avoid
fixture protocol races. Production uses PostgreSQL with TLS and its own configured connection pool.

In a second PowerShell terminal, set a fresh local AUTH_SECRET outside tracked files. Then configure:

```powershell
$env:DATABASE_URL='postgresql://postgres@127.0.0.1:55432/postgres'
$env:APP_URL='http://localhost:3100'
$env:AUTH_URL=$env:APP_URL
$env:AUTH_TEST_MODE='true'
# AUTH_SECRET must already contain at least 32 characters; do not commit or print it.
$env:EMAIL_DELIVERY_MODE='mock'
$env:PUBLIC_EMAIL_ENABLED='false'
pnpm --filter @labticker/web dev --hostname 127.0.0.1 --port 3100
```

Visit /auth/sign-in, request a fictional account link, wait for verification-request confirmation,
then open /auth/mock-inbox and use the latest link. The inbox is a development-only authentication
capability: do not share links, capture its URLs, expose the server publicly, or store screenshots.
Production disables this provider and inbox even if test flags are present. Public email stays unavailable.

Verify /dashboard allows three monitored applications. In /settings choose daily cadence, a valid IANA
timezone and express digest consent; save/reload and verify persistence. Consent remains checked only
when an active consent record exists. A regular user must be denied /admin, and the aggregate endpoint
must return 401 without its independent bearer credential. Sign out and repeat sign-in: the first verified
signup timestamp must remain stable so retention/activation cohorts do not reset.

Observed browser acceptance: a local magic-link callback reached the dashboard; three monitors were saved;
daily cadence, America/Edmonton and consent persisted; ordinary admin access was denied; unauthenticated
aggregate access returned 401. Initial fixture connection-limit and navigation-timing failures were diagnosed
before the successful round trip. This is local development evidence, not public-email or Neon readiness.

Next.js incoming request and server-function development logs are disabled to prevent token/form logging.
Authentication diagnostics contain only error categories and codes. Auth pages send no-store/no-referrer.
Deployment proxies must separately redact query strings; local logging configuration does not configure Fly.

The worker supports catalog-poll and mock-pilot against a reviewed development database; see apps/worker/README.md. Mock-pilot additionally requires canonical HTTPS APP_URL, UNSUBSCRIBE_SECRET of at least 32 bytes, SENDER_IDENTITY and SENDER_CONTACT. The HTTP browser fixture origin above cannot be reused for digest composition. Do not weaken HTTPS: use offline queue tests or a separately reviewed HTTPS preview origin. Runtime delivery remains mock-only and never selects the dormant Resend SDK adapter. Daily reports refresh 45 complete UTC dates.
The signed webhook tests use local cryptography and fixtures; no public webhook was registered.

Production gates still include reviewed Neon migrations/backup recovery, role isolation, protected GitHub
deployment, actual Fly hostname, Neon queue/concurrency acceptance, ambiguous-send reconciliation and verified sender/consent review. The Fly preview workflow deploys web only. A Linux Docker image built and passed local production-container smoke checks; the final digest-pinned/telemetry-disabled rebuild from code revision eb14c15 succeeded and passed production-container smoke checks. Local queue tests cover persisted claims, stable retries, suppression and acceptance-only receipts. Normal backlog has no silent 30-day cutoff; bounded overflow is reconsidered after one minute. Cancelled work that already attempted acceptance remains quarantined pending reconciliation.
Never use the unauthenticated fixture socket or mock authentication as production infrastructure.

For real PostgreSQL concurrency acceptance, use an empty disposable trusted PostgreSQL 17 container bound only
to 127.0.0.1:55433. Set LOCAL_DB_FIXTURE_ENABLED=true, then run pnpm test:postgres. The script refuses existing
public tables and production mode, applies migrations and writes fictional data with two independent pools.
Root executed concurrent prepare/shared-claim acceptance and locked-oldest-user progress checks successfully.
The database is intentionally left populated; discard the container after the check rather than reusing it.
The CI workflow now supplies its own digest-pinned PostgreSQL service without production secrets. This command
is independent of the browser PGlite fixture at port 55432 and must not target a real subscriber database.
