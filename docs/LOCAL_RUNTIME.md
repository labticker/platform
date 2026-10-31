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

The worker can run explicit catalog-poll mode against a reviewed development database; see apps/worker/README.md.
It cannot send email. Daily reporting recomputes 45 complete UTC dates for cohort maturation and delayed events.
The signed webhook tests use local cryptography and fixtures; no public webhook was registered.

Production gates still include reviewed Neon migrations/backup recovery, role isolation, protected GitHub
deployment, actual Fly hostname, durable digest queue/reconciliation and verified sender/consent review.
Never use the unauthenticated fixture socket or mock authentication as production infrastructure.
