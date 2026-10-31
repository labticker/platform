# Local core acceptance

This runbook reproduces the implemented core checks. A passing local run does not accept an entire product phase or authorize deployment, public sending, paid resources or advertising.

## Prerequisites and full local run

Use Node 22 and the package-manager version pinned in root package.json (pnpm 10.30.3). From the monorepo root:

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm catalog:validate
pnpm build
```

No production credentials, vendor MCP connection, external database or email account is needed for these checks. Tests use fixture transport and isolated in-memory PGlite databases. Fresh installation needs access to the package registry. The production build must not depend on a live sender or scheduler.

## Module map and focused checks

| Module | Responsibility | Focused command |
|---|---|---|
| packages/catalog | JSON Schema/runtime validation, URL screening and registry source contracts | pnpm --filter @labticker/catalog test |
| packages/database | Drizzle schema, catalog identity-preserving repository and PostgreSQL constraints | pnpm --filter @labticker/database test |
| packages/releases | GitHub intake, fetch-time network defenses, normalization/classification and backfill keys | pnpm --filter @labticker/releases test |
| packages/notifications | Daily/weekly timing, eligible release selection, signed token helpers, ad-free composition and mock gateway; dormant placement interfaces | pnpm --filter @labticker/notifications test |
| apps/worker | Disabled process scaffold plus offline database-to-mock integration acceptance fixture | pnpm --filter @labticker/worker test |
| packages/analytics | Allowlisted route/event sanitizer, disabled adapter and cookieless PostHog configuration | pnpm --filter @labticker/analytics test |
| apps/web | Branded catalog search/category/provenance preview, privacy page, gated analytics and honest health response | pnpm --filter @labticker/web build |

Root pnpm test runs the suites through Turbo. Final root verification after the current review corrections passed 33 tests (catalog 5, releases 13, database 2, notifications 10, analytics 2, worker 1), seven package typechecks, six build scripts and 50 catalog validations. Retest affected packages after subsequent corrections. Prior cached results or earlier runs are not evidence for untested edits.

## Database and offline release-to-digest acceptance

Generate reviewed schema changes with:

```powershell
pnpm --filter @labticker/database generate
```

The root drizzle directory contains generated SQL, snapshot and migration journal. Generation does not connect to Neon or apply schema changes remotely. A second generation should report no drift after the current migration is generated. Database tests apply that migration to PGlite, rerun it, test uniqueness/constraints and verify catalog renames retain stable application IDs, subscribers and release history.

The worker integration fixture parses an injected GitHub release, stores it with database deduplication, reads consent/verification/preferences/monitors from PostgreSQL, composes escaped HTML/plain text, retries an identical persisted payload through the mock inbox, records receipts after acceptance, and checks suppression/delivery exclusion. It makes no provider calls. It is not the durable runtime scheduler and does not prove cross-process leases, provider reconciliation or restart-safe live sends.

## Browser preview smoke

```powershell
pnpm --filter @labticker/web dev
```

Open the printed local URL. Confirm the LabTicker name/tagline and explicit mock-only preview state; search for Immich; change category filters; inspect provenance; visit /privacy and /api/health. Health should report preview, mock email and workerReady:false. With analytics disabled, inspect cookies/localStorage and requests: no analytics/ad vendor requests or tracking storage should appear. The root smoke observed one Immich result and only local static requests, with no ad requests or cookies/localStorage in noop mode. That browser run preceded the latest privacy-control addition and did not click/test the opt-out control.

Enabled PostHog requires a separate production-mode browser acceptance with approved project settings, safe event payloads, no identifying URL/referrer/device enrichment, no tracking cookies/localStorage, no replay and no advertising requests. Noop browser evidence does not prove those guarantees. Account privacy preferences/DNT must suppress tracking as implemented and tested before launch.

## Outstanding acceptance

Runtime authentication, monitor management and account deletion are unimplemented. No background database queue, provider quota/retry reconciliation, signed Resend webhook route, unsubscribe HTTP handler, authoritative PMF aggregates/admin dashboard or aggregate-only reporting API is accepted. GitLab/RSS adapters remain pending even though the registry contract supports them. Source precedence across importers still needs reviewed mapping and reconciliation orchestration.

No Neon migration, restore drill, protected GitHub production workflow or assigned Fly deployment has run. Local PGlite differs from a managed Neon environment and does not establish Neon concurrency, credentials, backups or rollback readiness. A live adapter smoke only verifies one upstream request at that moment; all routine tests remain offline and reproducible.

Keep public email disabled until a separately verified owner-controlled sender, consent/unsubscribe flow, signed webhooks, sender identity, quota review and authorized recipient tests are ready. Fly hosting is not sender-domain verification. Keep advertising compiled to no-op; analytics configuration never grants PMF or monetization approval.
