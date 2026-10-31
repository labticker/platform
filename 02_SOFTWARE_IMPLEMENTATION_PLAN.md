# LabTicker — Software Implementation Plan

**Purpose:** Actionable specification for a coding agent or developer.  
**Date:** 2026-10-30  
**Version:** LabTicker MVP / v0.6 (Fly `fly.dev` launch; privacy-preserving analytics; ads dormant)  
**Related:** `01_PRODUCT_MVP_PLAN.md`, `04_OPEN_SOURCE_CATALOG_SPEC.md`, `05_AI_MCP_OPERATIONS.md`, `06_ORG_CONTRIBUTOR_SETUP.md`, `08_AD_MONETIZATION_PLAN.md`, `09_ANALYTICS_AND_PMF_PLAN.md`, `10_LABTICKER_IDENTITY_AND_DOMAIN_ROLLOUT.md`

## A. Architecture decision

### Recommended launch deployment

```
Browser
  |
  v
Fly.io Next.js web machine (HTTPS)
  |  -- authenticated dashboard / JSON endpoints
  |  -- Resend webhook endpoint
  |
  +----> Neon PostgreSQL (managed, free tier initially)
  |
  +----> Resend Emails API (magic links + personalized digests)

Fly.io worker machine (separate process, same codebase/image)
  |  -- catalog sync daily
  |  -- release-feed polling every 1-2 hours
  |  -- due-digest preparation every 10-15 minutes
  |  -- queued sends/retries; reconciliation
  +----> Neon PostgreSQL
  +----> Catalog / RSS sources (allowlisted hosts)
  +----> Resend
```

Use **PostgreSQL from day one**, not a Fly volume-backed SQLite file; this makes web/worker concurrency, delivery tracking and future scaling easier. Fly.io Managed Postgres has a higher baseline cost (~USD $38/mo plus storage, per current pricing). **Neon free PostgreSQL** is a good initial separate service; verify its current free quota and latency, and budget for upgrade when necessary. A paid Fly managed database is a later option.

Fly runs the app and worker. The initial deployment uses two always-on, small Machines to avoid unreliable in-web-process timers. For higher traffic, web can scale independently and worker concurrency can be adjusted. No Redis required: PostgreSQL stores scheduling state, claims, retries and delivery records.

**Alternative ultra-small option:** one Fly Machine for both web and scheduler is possible, but coupling app uptime and scheduled jobs introduces avoidable operational risk. Do not choose this as default.

### Operating model and repo design

- **GitHub organization:** dedicated public `platform` repository and optional public `.github` profile repository. One pnpm/Turborepo monorepo, two Fly process groups (`web` and `worker`) sharing a versioned TypeScript codebase and Neon PostgreSQL. No additional services/queues at launch.
- **Git is the declarative source of truth** for custom catalog JSON, Drizzle migrations, Fly configuration, CI pipelines and agent instructions. Resource bootstrap needs explicit operator approval where a platform requires identity verification, DNS control or paid billing.
- **Codex + MCP** can create code and PRs, inspect non-sensitive staging resources, and troubleshoot. Standard Fly deployments are via GitHub Actions using pinned `flyctl`; the Fly MCP lacks deploy/app-create operations. Neon MCP must be bound to development/testing, not production.
- **Community contribution path:** GitHub PR -> schema/semantic validators (no secrets) -> maintainer review -> merge -> catalog importer -> existing subscription matching unchanged. Treat PR content and upstream release notes as untrusted input, especially when an agent can read it.

### Technology choices

- `Node.js` active supported LTS, `TypeScript` strict, `pnpm`, pinned versions/lockfile.
- `Next.js` App Router with server actions or route handlers; avoid introducing a second API service.
- `Tailwind CSS` + `shadcn/ui`; accessible controls; mobile responsive.
- `Drizzle ORM` + PostgreSQL migrations; `Zod` for input validation.
- `Auth.js` database-backed email magic-link provider (or comparably maintained email-auth stack). Resend sends verification links; digest consent must be separate from mere account creation.
- `Resend` Node SDK and React Email email templates (HTML + plain text).
- `rss-parser`/standards-compliant Atom/RSS parser (pick maintained dependency at implementation time); `semver` where applicable.
- `Vitest`, `Testing Library`, `Playwright`; static lint/type checks in CI.
- Structured JSON logging, request IDs, dashboard/worker health endpoints; **core privacy-preserving product analytics**: PostHog (cookieless, no person profiles or session replay), signed Resend engagement/delivery webhooks, Neon materialized aggregate metrics and official PostHog MCP. Details in `09_ANALYTICS_AND_PMF_PLAN.md`. Do not send email addresses, magic-link URLs or identifiable subscriber activity to PostHog.

No queue service, no **end-user AI functionality**, no payment provider, no Docker-installable homelab agent, no CVE integration in the MVP. Codex AI **does** receive read-only analytics access for product management.

## B. Source ingestion: critical spike and fallback

### Why this must come first

selfh.st publishes a browsable project directory and project-specific stable-release RSS feeds. Older versions of its machine-readable catalog existed in a GitHub repository with `/data`, `/icons`, and `/releases`, and a public mirror remains. **Do not assume the historical repository is a live supported API:** `https://github.com/selfhst/apps` currently returns 404. The repository copy found at `https://github.com/rocketnova/selfhst-apps` is not the maintainer's verified live upstream. A license on a mirror is not sufficient by itself to certify everything, particularly third-party icons.

### Spike deliverables

1. Identify official live catalog data endpoints or permitted export method and project stable-release RSS URLs; record actual examples and permissions.
2. Inspect 20 representative applications: GitHub and GitLab, unusual tag formats, no release, duplicate names, missing repositories, multiple release channels.
3. Confirm release feeds include titles, GUID, published dates, links and content; measure feed history and delay.
4. Document attribution/license requirements and any fetch restrictions.
5. Produce `catalog/services/*.json` and/or `data/seed-apps.json` with at least 50 verified apps. If the canonical source is unavailable, curate these manually using official repository/release links, and store provenance.
6. Define import parser via test fixtures, not guesses about JSON keys. All external schema validation happens at this boundary.

### Adapter interface

```ts
type CatalogEntry = {
  externalId: string;
  name: string;
  aliases: string[];
  description?: string;
  category?: string;
  projectUrl?: string;
  repositoryUrl?: string;
  stableReleaseFeedUrl?: string;
  provenanceUrl: string;
};

type NormalizedRelease = {
  sourceKey: string;           // stable provider+feed identifier
  guid: string | null;
  versionTag: string | null;
  title: string;
  releaseUrl: string;
  publishedAt: Date | null;
  notesText: string;
  observedAt: Date;
};

interface CatalogAdapter { fetchCatalog(): Promise<CatalogEntry[]>; }
interface ReleaseAdapter { fetchReleases(source: ReleaseSource): Promise<NormalizedRelease[]>; }
```

Providers: `SelfhstCatalogAdapter` (only after verification), `StaticSeedCatalogAdapter` (always available), `RssReleaseAdapter` (primary), optional `GitHubReleasesAdapter` (fallback for verified repo URLs).

### Custom JSON registry and reconciliation

- One service definition per `catalog/services/<slug>.json`, validated by `catalog/schema/service.schema.json`. JSON examples and rules are defined in `04_OPEN_SOURCE_CATALOG_SPEC.md`.
- Import adapter output stores `origin` (`custom_json` / `selfhst` / `manual`), `sourceRecordId`, `sourceHash`, and `provenanceUrl`. Avoid directly editing the database as the long-term authority for community-defined services.
- Identity is based on a canonical stable `slug` and repository/release URLs (as aliases). Prevent accidental duplicate projects despite name differences. Detect collisions; don't silently auto-merge on low-confidence name matches.
- Merge priority: approved JSON override > imported selfh.st > manually verified fallback. Fields are merged, not entire entities replaced. Never overwrite a maintained value with null/blank; log changes, soft-disable vanished entries, preserve internal IDs and existing subscriptions.
- For non-selfh.st projects, poll GitHub/GitLab releases via upstream APIs or a verified RSS/Atom feed. Do not fetch arbitrary website URLs or let JSON define executable commands, handlers or private network destinations.
- Only trusted maintainers merge catalog additions; PR CI has no write tokens or production secrets. On merge, run a safe catalog sync, without deploying unreviewed executable code from untrusted PRs.

### Import rules

- Maintain an internal immutable app ID and a `source_key` mapping, never identify subscriptions solely by display name.
- Upsert metadata; log additions/changes; protect admin overrides; never hard-delete due to absence from source.
- Support aliases and canonical-name corrections; a new upstream slug must not disconnect users.
- Only fetch approved remote URLs from trusted allowlisted domains. Validate redirects, timeouts and response sizes to avoid SSRF and unexpectedly expensive fetches.
- Poll conditionally with ETag/Last-Modified and a descriptive User-Agent; limit concurrent network requests.
- Store original release URL and an origin/source timestamp. Show accuracy/freshness state.
- Do not automatically trigger emails on a fresh seed/backfill.

## C. PostgreSQL data model

**Catalog schema additions to the previous data model:** `catalog_sources` (source identifier, type, base URL, permitted policy, last sync); `catalog_import_runs` (source, result, counts, checksum, errors); `app_source_records` (application ID, provider, external ID, source hash, provenance, last seen); optional `apps.catalog_slug`, `apps.is_curated`, `apps.status`, and `apps.catalog_revision`. Add unique constraints for `(provider, external_id)` and canonical slugs. Keep original `apps.id` immutable and all user subscriptions intact. Consider a separate `catalog_overrides` table only if runtime admin overrides are needed; Git-tracked JSON remains authoritative for contributed entries.


Use UUID identifiers and timezone-aware timestamps; all dates stored UTC. Keep SQL migrations in `drizzle/`. Suggested tables:

| Table | Important fields and constraints |
|---|---|
| `users` | `id`, unique normalized `email`, `email_verified_at`, `created_at`, `role` (`user`/`admin`), deleted/suppressed flags |
| `auth_accounts`, `auth_sessions`, `verification_tokens` | Auth.js-managed tables, with required adapter shape and unique/index constraints |
| `email_consents` | `user_id`, `consent_type`, `policy_version`, `consented_at`, `source`, `withdrawn_at`; immutable event history preferred |
| `preferences` | unique `user_id`, enum `daily`/`weekly`, `timezone`, `enabled`, `next_due_at`, `last_digest_end_at` |
| `applications` | `id`, unique `slug`, `name`, `description`, `category`, `homepage_url`, `repo_url`, `catalog_source`, `catalog_external_key`, `is_active`, `updated_at` |
| `app_aliases` | `application_id`, `alias`, unique normalized alias mapping |
| `release_sources` | `id`, `application_id`, `provider`, `url`, `external_key`, `enabled`, `etag`, `last_modified`, `last_polled_at`, `last_ok_at`, `last_error` |
| `releases` | `id`, `application_id`, `release_source_id`, `source_guid`, `dedupe_key`, `tag`, `title`, `release_url`, `notes_text`, `published_at`, `first_seen_at`, `is_backfill`, `warning_flags` jsonb; unique `(application_id, dedupe_key)` |
| `subscriptions` | `(user_id, application_id)` unique, `created_at`, `enabled_at`, `disabled_at`, `active` |
| `digests` | `id`, unique `(user_id, scheduled_for)`, `window_from`, `window_to`, `status` (`pending/claimed/sent/skipped/failed`), `attempt_count`, `claim_until`, `idempotency_key`, `resend_id`, `sent_at`, `sponsor_campaign_id`, `last_error` |
| `digest_items` | unique `(digest_id, release_id)`, FKs to digest/release; record immutable selected content at preparation time if necessary |
| `delivery_receipts` | `user_id`, `release_id`, `digest_id`, unique `(user_id, release_id)` once accepted, `resend_id`; enables no duplicate delivery |
| `sponsors` | `id`, `display_name`, `contact_email`, `status` |
| `sponsor_campaigns` | Legacy proposed direct-sponsor model; prefer unified `monetization_campaigns` below before first migration |
| `monetization_campaigns` | `id`, `channel`, `kind` (`affiliate/sponsor`), `partner_name`, `headline`, `body`, `approved_target_url`, `disclosure`, `starts_at`, `ends_at`, `status`, `approved_by`, `approved_at` |
| `digest_campaign_placements` | Unique `digest_id` + `campaign_id`, rendered/sent metadata; records sends, **not** human ad impressions |
| `provider_events` | unique provider event ID, email ID, type, created_at, processed_at; deduplicates webhook replays |
| `job_runs` | job name, start/end/status, counts, error for monitoring and admin view |

**Indexes:** subscriptions by user/app, releases `(application_id, first_seen_at DESC)`, preferences `(enabled, next_due_at)`, digests by `(status, claim_until)`, sources by enabled/last_polled.

**Important nuance:** `delivery_receipts` should be added only when Resend accepts the digest; do not mark items delivered merely because a job was created. If a digest send fails, those items remain eligible for a future retry. If a user's frequency changes, the same release is never sent twice.

## D. Release classification rules

Treat annotations as *possible indicators*, never certified migration requirements.

- Normalize tags by stripping common leading `v`, whitespace and predictable prefixes only when safe.
- Parse with `semver`; compare against prior stable release **of the same app/channel** when both parse reliably; otherwise leave `major_release=false/unknown`.
- Explicit major version change: `new.major > old.major` for valid semver; ignore 0.x convention ambiguities by labeling `major version increment`, not guaranteed breaking.
- Sample patterns (case-insensitive) on plain release-note text:

```regex
\bBREAKING[ -]CHANGES?\b|\bnot backwards? compatible\b|\bincompatible with previous\b
\bmanual migration\b|\bmigration (?:is )?required\b|\bdatabase schema migration\b
\bdeprecated\b|\bno longer supported\b|\bremoved\b
```

- Negation guard: do not classify a phrase like “no breaking changes” as positive unless additional positive context exists.
- Emit `warning_evidence` with a short original excerpt, a clear label such as “Possible breaking change”, and official release URL.
- Cap excerpt, sanitize/escape output; store raw notes for internal text search only if source terms allow it.
- Unit-test false positives and semver / non-semver tags with fixtures.

## E. Jobs and scheduling

Run one **worker process group**, count 1 to start; the worker schedules jobs from the database and runs periodic work. `setInterval` can tick every minute to evaluate due jobs, but all authoritative state is in PostgreSQL and tasks must survive restarts. Use a single-process cron library only as a clock, **not** as the durable job queue.

| Job | Initial cadence | Safety behavior |
|---|---|---|
| `catalog-sync` | Daily (once source verified) | Upsert only, audit changes, manual overrides protected |
| `release-poll` | Every 60–120 minutes | Conditional GET, bounded concurrency, retry with backoff, source last-success tracking |
| `classify-new-releases` | After successful poll | Deterministic; safe to rerun |
| `prepare-digests` | Every 10–15 minutes | Select due users, DB transaction/lock, unique user+scheduled window |
| `send-digests` | Every few minutes | Respect Resend quota, retry 429/5xx, stable idempotency key |
| `reconcile-failed-jobs` | Every 10–15 minutes | Requeue timed-out claims, alert on backlog |
| `housekeeping` | Daily | Expire login tokens and old logs under retention policy |

### Digest algorithm (pseudocode)

```
for each due user with active consent and digest enabled:
  claim with DB row lock/skip locked
  compute window bounds and snapshot currently active subscriptions
  find releases first_seen after each subscription enabled_at,
      not already in delivery_receipts,
      not baseline/backfill,
      and observed before window end
  if empty: mark scheduled window skipped, set next_due_at
  else:
     persist digest and digest_items with unique (user, scheduled_for)
     for MVP/beta always choose no campaign; only after the owner explicitly enables post-PMF monetization may a separate guarded path select at most one approved affiliate/sponsor (never website ad-network code)
     enqueue durable send by status='pending'

for each pending/expired-claimed digest:
  claim atomically with lease and attempt counter
  generate stable content from persisted digest_items, not live feed data
  send via Resend Emails API with idempotencyKey='digest/<digest UUID>'
  on success: record provider message ID and per-release delivery receipts,
              mark sent and update next_due_at
  on retryable error: exponential backoff, preserve same payload/key
  on permanent error: mark failed, alert, suppress bounces/complaints
```

**Resend idempotency keys last 24 hours.** Prefer reusing the same key *and exact payload* for normal retries. For ambiguous states older than that window, manually reconcile the provider message ID/log before blindly resending. This is part of launch testing.

### Timezone rules

- Capture IANA timezone at signup, default to UTC if unavailable, allow user editing.
- Default daily 09:00 local; default weekly Monday 09:00 local.
- Use a timezone-aware library and UTC `next_due_at`, recompute each window. DST transitions should produce one window per intended local date, without duplicates.
- App subscriptions created mid-window receive only releases first discovered from that point onward.
- On paused/disabled digest, do not send; on resume, define and document whether pending missed releases are included (recommend include unseen releases up to a 30-day cap).

## F. Email / Resend design

### Sending choice

The **Emails API** fits fully individualized bodies because each recipient watches different projects. Resend docs say newsletters may be sent via Emails or Broadcasts, provided consent and unsubscribe are handled. Broadcasts are billed per contact and support automatic unsubscribe but are less convenient for completely different content per recipient. Abstract provider behind `EmailGateway` to allow later migration or Broadcast experiments.

- `magic-link`: purely account authentication, no sponsor.
- `digest`: consented software updates, HTML and plain text, one recipient per request, **no ads during MVP/beta**. Implement a dormant future first-party sponsor insertion point, but never enable it without post-PMF consent and approval. Google AdSense and Carbon scripts/tags must never appear in email.
- For real outbound emails verify a domain you own using SPF/DKIM/DMARC. Use distinguishable `updates@...` and `login@...` on that verified sender domain. Fly `*.fly.dev` is a **web hostname**, not an assumed verified Resend sending domain. Until verification is complete use `EMAIL_DELIVERY_MODE=mock`, Resend test tooling and/or a local inbox only; do not enable public email sign-in/digests.
- Include visible **Unsubscribe** link and `List-Unsubscribe` / `List-Unsubscribe-Post` headers. Implement one-click RFC 8058 POST with signed opaque token, separate GET confirmation page (avoid security-scanner accidental unsubscription).
- Consent checkbox at MVP: *“Send me the software update digests I select. I can unsubscribe at any time.”* Keep unticked, log text version/time, and confirm via magic link. Review and obtain appropriate additional consent before introducing sponsored content later; do not silently expand a subscriber’s consent.
- Store organization/business identification and valid contact details in footer. CASL and other sending laws apply; get local legal review if launching broadly.
- Verify Resend webhook signatures using raw body; process `email.bounced`, `email.complained`, relevant delivery/failed events and suppress affected addresses.
- Batch/rate-limit by provider quota and avoid empty emails. Don't use open pixels in the MVP.

### Sample digest anatomy

```
Subject: Your Homelab Updates — 4 new releases

4 releases from software you follow

Immich — [tag]  [Possible breaking change]
  [short original excerpt; no invented summary]
  View release notes

Proxmox VE — [tag]
  [short original excerpt]
  View release notes

...other releases...

SPONSORED: [name]
  [clearly disclosed offer, optional]

Manage my monitors | Change frequency | Unsubscribe
Sender identity + required contact details
```

## G. HTTP routes/API behavior

Keep session-protected writes on server; validate auth and all inputs. Suggestions:

| Route/method | Purpose |
|---|---|
| `GET /api/apps?q=&category=&page=` | Search paginated catalog |
| `GET /api/apps/:slug` | App details, recent releases |
| `GET /api/me/subscriptions` | Current user's selected apps |
| `PUT /api/me/subscriptions/:appId` | Subscribe (idempotent) |
| `DELETE /api/me/subscriptions/:appId` | Unsubscribe from single app |
| `GET /api/me/preferences` | Read preference |
| `PATCH /api/me/preferences` | Daily/weekly, timezone, pause |
| `GET /api/me/releases` | Current user's recent watched releases |
| `GET /unsubscribe?token=` | Show unsubscribe confirmation without session |
| `POST /api/unsubscribe` | Process signed token, immediate suppression |
| `POST /api/webhooks/resend` | Verify and process provider events |
| `GET /api/health/live` | Process alive, no secret info |
| `GET /api/health/ready` | DB connectivity ready, no secret info |
| `GET /admin/*` | RBAC-protected admin UI |

Protect mutation endpoints with CSRF protections appropriate to auth/session strategy and rate limits. Never allow untrusted email content to render unsafe HTML; convert release notes into escaped text/plain safe output, not permissive arbitrary Markdown/HTML.

## H. Project layout

```text
platform/
  apps/web/                         # Next.js public UI + API
  apps/worker/                      # dedicated Fly process for scheduled jobs
  packages/database/                # Drizzle schema + migrations
  packages/catalog/                 # selfh.st importer + JSON registry validator
  packages/releases/                # per-source adapters + classifiers
  packages/notifications/           # Resend and digest service
  packages/shared/                  # shared Zod contracts and utilities
  packages/ui/                      # reusable components
  catalog/schema/service.schema.json
  catalog/services/<slug>.json      # contributions through PRs
  catalog/README.md
  infra/fly.toml
  infra/Dockerfile
  .github/workflows/ci.yml
  .github/workflows/catalog-validate.yml
  .github/workflows/deploy.yml
  AGENTS.md
  LICENSE
  CONTRIBUTING.md
  SECURITY.md
  GOVERNANCE.md
```

The `apps/worker` process contains catalog, release and digest modules; do not initially deploy each module as a separate application.



```
/
  app/                         # Next.js App Router pages and API routes
  components/                  # dashboard and catalog UI
  emails/                      # React Email templates
  src/
    auth/                      # Auth.js config, consent flows
    db/                        # Drizzle schema, access queries
    catalog/                   # import adapters + mapping
    releases/                  # RSS parser, dedup, classifier
    digests/                   # windows, selection, assembly
    monetization/             # approved affiliate/sponsor placement, disclosure, public site ad adapter
    providers/resend/          # email gateway, verified webhooks
    jobs/                      # lease/claim, scheduling, logging
    observability/             # metrics, logs, health
  worker/main.ts               # dedicated worker entrypoint
  drizzle/                     # SQL migrations
  data/seed-apps.json          # vetted fallback catalog
  tests/unit/
  tests/integration/
  tests/e2e/
  docs/                       # ADRs, runbook, terms/privacy drafts
  Dockerfile
  fly.toml
  .env.example
  pnpm-lock.yaml
```

## I. Fly.io deployment

**Agentic deployment contract:** Fly's official beta MCP (`https://mcp.fly.io`) can inspect/manage existing app resources, but **does not currently implement app creation, general config update or deployment**. Codex uses `flyctl` with a properly scoped credential for initial bootstrap, then GitHub Actions executes version-pinned `flyctl deploy` after merges that pass CI and protected-environment approval. Fly MCP is primarily for observability and routine Machine operations. Verify available tool scopes before attempting any mutation.

**Neon development safety:** use `https://mcp.neon.tech/mcp` for development and testing branches only, with a project-scoped key/OAuth and explicit approval for SQL writes. Production Drizzle migrations run via audited CI after review of schema diff and a rollback/backup plan, not as ad-hoc Codex MCP queries.

**Resend automation:** use the official hosted MCP at `https://mcp.resend.com/mcp` for onboarding test domains, webhooks, and delivery diagnostics. Test only verified addresses and a test workspace. Make bulk broadcast sends and new marketing contacts approval-gated, with double opt-in where appropriate.

**Secrets:** `.env.example` contains names but not values. Fly app secrets and protected GitHub Environments store runtime/CI credentials; avoid saving secret values in `AGENTS.md`, PR descriptions, MCP config checked into Git or agent logs. Use distinct development/production keys and rotate compromised credentials.


### Development

- Local Postgres in a Docker Compose file for development only (not required for users or on the production app).
- `.env.example`: `DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`, `RESEND_API_KEY`, `RESEND_FROM`, `RESEND_WEBHOOK_SECRET`, `APP_URL`, `UNSUBSCRIBE_SIGNING_KEY`, `CATALOG_SOURCE_URL` (only if validated), `ADMIN_EMAILS` or explicit DB role, `WORKER_ENABLED`, `NODE_ENV`, `EMAIL_DELIVERY_MODE=mock|resend`, `PUBLIC_EMAIL_ENABLED=false`, `NEXT_PUBLIC_POSTHOG_KEY` (when configured).
- `pnpm dev` for Next.js; `pnpm worker:dev` for scheduled worker.
- Migrations: `pnpm db:generate`, `pnpm db:migrate`, `pnpm db:seed`.

### Production Fly config (illustrative, verify generated config against current Fly docs)

```toml
app = "labticker"  # tentative: verify availability, replace with the actual allocated Fly app name
primary_region = "iad"

[processes]
  web = "node .next/standalone/server.js"
  worker = "node dist/worker/main.js"

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = "off"
  auto_start_machines = true
  processes = ["web"]

[[vm]]
  size = "shared-cpu-1x"
  memory = "1gb"
  processes = ["web"]

[[vm]]
  size = "shared-cpu-1x"
  memory = "256mb"
  processes = ["worker"]
```

**Notes:** `labticker.fly.dev` is a proposed hostname, **not a reserved or verified URL**. Above is configuration intent, not blindly executable final config; confirm current `fly.toml` schema and node artifact location. Ensure the Docker image builds and contains both the Next.js standalone output and compiled worker. `fly launch` may generate a starting configuration; set initial scale counts explicitly to `web=1`, `worker=1`. The worker must have no public HTTP service. Set DB URL and email keys with `fly secrets set`; never put secrets in the TOML file or GitHub. Put app and DB close geographically (for example Fly `iad` with a US East Neon project, conditional on actual region availability).

### Launch/deployment checklist

1. Create the **public** `labticker/platform` repository if the org handle is available (otherwise owner-approved alternative), CI and protected default branch.
2. Provision Neon PostgreSQL in a suitable region; connect TLS, enable backups/restore path appropriate to plan.
3. Create Fly app with Dockerfile and process groups; commit `fly.toml`.
4. `fly secrets set ...` with `APP_URL=https://<assigned-app>.fly.dev`; verify Fly-provided HTTPS. **Do not attach a custom domain in MVP.**
5. Verify `pnpm db:migrate` in deployment workflow/release command before new app traffic.
6. Configure Resend account quota and verified sender domain/DNS **only when a domain controlled by the owner is available**; meanwhile use mock/test-mode email and webhooks. Never assume `fly.dev` can be verified as a sender.
7. Deploy to staging; enable test address safelist; run a deterministic digest against fixture releases.
8. Deploy production; verify source sync logs, worker one-instance only, no duplicate sending after restart.
9. Configure alerting for stale feeds, cron failures, digest backlog, bounced email ratio, DB connectivity, and spending thresholds.
10. Document restore process and periodically test restoring a backup into staging.

## J. Budget and capacity planning

**Indicative USD/month, not a fixed quote.** Fly prices vary by region, resource choice, and running time. See official pricing before provisioning.

| Item | Small beta assumption | Notes |
|---|---:|---|
| Fly web Machine | ~$6–10 | 1 shared CPU, ~1 GB RAM, always on |
| Fly worker Machine | ~$2–5 | 1 shared CPU, 256–512 MB, always on |
| Neon PostgreSQL | $0 initially | Subject to free-tier compute, storage and transfer limits |
| Resend Emails API | $0 at low volume | 3,000/month and 100/day; quota can be hit by bursts |
| Domain | ~$1–2 amortized | Depends on registrar/TLD; excludes initial registration timing |
| Observability | $0–10 | Can begin with Fly logs + existing monitor |
| **Early beta total** | **~$9–27** | Excludes developer time, tax and paid email upgrades |

When email volume rises, Resend Pro is $20/mo for 50,000 messages. Fly Managed Postgres starts at ~$38/mo plus storage if replacing Neon. The **100/day free Resend limit** is often the first bottleneck for weekly digests: 150 users due Monday cannot all get their digest on Monday on that plan.

Use `estimate_monthly_sends = daily_recipients*30 + weekly_recipients*4.33 + auth_messages + retries` (approximately; not a billing guarantee). Compare daily peaks separately from monthly total. Upgrade before a quota backlog appears.

## K. Testing strategy and acceptance suite

### Unit tests

- Catalog adapter normalization and unknown/missing fields.
- RSS/Atom parser, pagination/duplicates, GUID changes, timezone changes.
- Semver vs calver, prerelease exclusions, negation false positives.
- Digest item selection: subscription activation, backfill exclusion, unsubscribe, paused state.
- Exactly one approved affiliate/direct sponsor or none; advertiser content escaped, links checked. No AdSense/Carbon code in emails. Website AdSense is disabled without publisher approval and applicable consent.
- `next_due_at` across timezones, DST boundaries and weekly changes.

### Integration tests

- DB migrations and uniqueness constraints on a disposable PostgreSQL database.
- Two concurrent workers cannot claim/send same digest; recover expired claims.
- Repeated same release import updates metadata without duplicating release/event.
- Resend mock returns 429/500/timeout; retry preserves content/idempotency key.
- Auth email link expiry/replay protection.
- Webhook invalid signature rejected; event replay is idempotent; bounce suppresses.
- One-click unsubscribe POST stops future messages immediately; GET alone does not unsubscribe.

### E2E tests

- Signup -> verify -> select 3 apps -> choose weekly -> verify dashboard.
- Import a fixture release -> due digest -> render HTML+text preview -> confirm source link.
- Unsubscribe through email -> future digest skipped -> settings reflect opted out.
- Add app after a release -> no historical notification; next new release included.
- Admin fixes feed mapping -> existing subscriptions preserved.
- Staging Fly deploy -> `/api/health/ready` passes, scheduled worker alive.

### Nonfunctional acceptance

- 99th percentile page response acceptable under 100 beta concurrent requests (test target, not SLA).
- 50–100+ apps and hundreds of releases can be polled on schedule without API abuse.
- No credentials are returned to client or logged.
- Scheduled batch catches up after worker downtime without sending duplicates.
- Accessible monitor toggles and unsubscribe links on mobile.

## L. Phased engineering backlog

### Phase 0: Verify foundations (gating)

- Create/confirm new GitHub organization, public monorepo, CODEOWNERS, maintainers, license policy, AGENTS.md, organization protections, default branch and PR approvals.
- Configure Codex with GitHub/Neon/Resend/Fly official MCPs and required first-time sign-ins. Verify capabilities safely using reads and test resources; Fly deployment via flyctl.
- Establish schema and seed catalog with at least one project absent from selfh.st; validate PR flow and reconciliation.


- [ ] Validate current selfh.st catalog/feed availability, permission, schema and stable URLs.
- [ ] Assemble verified seed catalog of >=50 apps and known RSS links.
- [ ] Create Fly, Neon and Resend development accounts; verify database network access and one send from verified domain.
- [ ] Lock source and data policy, licensing attribution, and acceptance fixtures.
- **Done when:** at least 20 representative apps can be normalized and their latest stable feed entries parsed reliably.

### Phase 1: Scaffold and persistence

- [ ] Next.js/TS/Tailwind/shadcn project, lint/format/unit tests/CI.
- [ ] Drizzle schema, migrations, seed scripts, integration DB tests.
- [ ] Auth.js magic links, session management, consent event and access controls.
- [ ] Fly web+worker process builds and staging deploy.
- **Done when:** user can sign in and see a protected blank dashboard in staging.

### Phase 2: Directory and subscriptions

- [ ] Catalog import adapter + static fallback; validation and source provenance.
- [ ] Search, categories, pagination, aliases, details and release-source state.
- [ ] Monitor/unmonitor APIs and dashboard; all writes scoped to signed-in user.
- [ ] Minimal admin for catalog correction and disabled feeds.
- **Done when:** user can select/remove 3 verified apps; source refresh never deletes their choices.

### Phase 3: Release ingestion and warnings

- [ ] RSS/Atom polling, conditional requests, normalization and deduplication.
- [ ] Source last-success/error telemetry and rate-limited retries.
- [ ] Semver version detector and conservative regex flags; fixtures and evidence snippets.
- [ ] Backfill cutoff and recent-release browser UI.
- **Done when:** repeated polling creates exactly one release row and one warning result per unique stable release.

### Phase 4: Digests and Resend

- [ ] Preferences, timezone scheduling and DB-backed job claims.
- [ ] Delivery receipts, deterministic digest snapshots, send idempotency and retries.
- [ ] React Email HTML/text template and signed unsubscribe URL + RFC 8058 headers.
- [ ] Resend webhook signature verification/suppressions and consent enforcement.
- [ ] Quota/rate controls and staging test-mode sends.
- **Done when:** daily and weekly digests deliver only unseen subscribed releases, no duplicate on retry, unsubscribe stops new sends.

### Phase 5: Dormant advertising foundation and production hardening

- [ ] Define campaign schema, admin-only draft/preview, and a max-one email sponsor template; **all real sends must have zero placements** until post-PMF explicit activation. Never ad-network snippets in email.
- [ ] Website ad slot, no-op provider and adapter contract; **no AdSense script/provider activation in MVP**. Record deferred provider-approval and privacy/CMP checklist for later.
- [ ] No ads on auth, settings, admin or unsubscribe; site should work with advertising permanently disabled.
- [ ] Source freshness/digest backlog alerts, logs, dashboards and runbook.
- [ ] Privacy/terms/contact pages, CASL consent and data export/delete flow.
- [ ] Database backup/restore drill, load smoke tests and CI deploy checks.
- [ ] Invite-only beta, monitor delivery outcomes and cost.
- **Done when:** first invite users receive correct, strictly **ad-free** release digests reliably, disabled advertising interfaces pass tests, and operations are documented.

## M. Operational runbook

| Problem | Detection | Response |
|---|---|---|
| selfh.st feed/catalog down | `last_ok_at` stale, spike in HTTP errors | Retain cached data, retry with backoff; fallback verified direct feeds; show degraded source |
| No new releases showing | Worker job `last_ok_at` stale | Inspect worker logs, DNS/HTTP headers, last sync, feed parser changes |
| Email sending quota reached | Resend 429 or quota API/error | Pause batch, surface alert, defer windows and upgrade; no silent drops |
| Unexpected duplicate email | Same user/window; provider ID mismatch | Inspect digest uniqueness and idempotency key; disable sends until fixed |
| Resend bounce/complaint | Signed webhook | Suppress contact and record event, don't retry address |
| Database unreachable | Readiness/worker DB errors | Halt new sends; resume with leases on recovery; restore if required |
| Admin imports bad source mapping | Diff/review/failed fixture | Disable source, correct mapping, reprocess safely; preserve subscriptions |
| Security incident | Unusual auth logs/access | Revoke credentials, pause digests, restore secrets, investigate and notify where required |

## N. Explicit architectural decisions / future extension points

- Add `installed_version` later to `subscriptions` or a separate asset inventory model; not required for launch.
- Add future vulnerability/advisory tables separately; never overload release-warning flags to claim CVEs.
- Add future paid billing and entitlement checks in application services, not sprinkled throughout UI.
- Add future AI summaries only with original source citations, version-range awareness and uncertainty; cache once per release/version pair to cap cost.
- Implement email gateway/adapter so Resend Broadcasts or alternative providers can be evaluated if personalized-message cost rises.
- Provide a no-op web ad provider from launch and a dormant email sponsor interface; both remain OFF until an explicit post-PMF owner decision, then separate network/legal/user-consent approvals. See `08_AD_MONETIZATION_PLAN.md`.
- Prefer self-hosting an **owned catalog mirror with provenance** after a permitted initial import; user trust should not depend on an undocumented third-party endpoint staying stable.

## O. Acceptance checklist for release v0.1

- [ ] Current catalog usage rights and current feed paths verified; fallback catalog exists.
- [ ] >=50 approved monitorable projects.
- [ ] User can register, verify, subscribe and switch daily/weekly.
- [ ] Stable releases detected, release notes linked, possible migration/breaking warnings clearly caveated.
- [ ] Emails contain exactly selected unseen releases; no empty sponsored emails.
- [ ] Clear, working unsubscribe and express sponsorship consent; bounce suppression.
- [ ] **Zero** email placements in MVP/beta; future implementation is constrained to at most one approved, disclosed placement and never an ad-only email.
- [ ] **Zero advertising vendor scripts and requests** in MVP/beta even if credentials exist; no AdSense in email. Future Carbon remains a mutually exclusive replacement, not backfill.
- [ ] Production Fly web and worker machines running, database backed up, secrets protected.
- [ ] Worker restart/DB outage/provider timeout tested; duplicate/dropped email guard proven.
- [ ] CVEs, AI and paid plans disabled/not implemented.

## P. Agent-managed infrastructure & CI contract

**Routine agent jobs**: create issue/branch/PR; run tests; regenerate schema fixtures; validate catalog PRs; analyze Fly logs and Resend webhook failures; inspect Neon dev branches; suggest changes. **Protected operations**: production Fly deploy approval, production migration, sending campaigns, creating billable resources, deleting applications/data, changing authentication/security policies or secrets.

CI must implement PR gates (lint, typecheck, test, JSON Schema, duplicate/repo consistency checks, egress URL validation, migration-on-branch) and a production deploy workflow using Fly `flyctl` (not MCP), with environment approval and smoke tests. Keep web and worker on same commit SHA. Use a staging database branch and do not give forked PRs access to credentials.

**MCP startup examples** and detailed security policy: `05_AI_MCP_OPERATIONS.md`.

## Core analytics implementation (required during MVP)

Read `09_ANALYTICS_AND_PMF_PLAN.md` for the binding event dictionary, Resend metrics workflow, privacy requirements, dashboard metric definitions, database additions, PostHog MCP and test suite. In particular, instrument web traffic and funnel actions with PostHog cookieless mode (`person_profiles: never`, autocapture/replay disabled), and store signup/monitor activation, digest delivery, bounce, complaint, click and opt-out metrics in Neon. Use signed Resend webhook events, deduplicate on provider event ID and aggregate daily for read-only Codex reporting. **Open tracking is optional, domain-wide, explicitly disclosed, and its rate is estimated due to Apple MPP; it is not a PMF gate.** The release-to-digest tests must verify delivery telemetry as well as email output.

AI must not have raw production subscriber-data access; build a protected read-only aggregate-report endpoint (or small read-only MCP) to complement official PostHog MCP. Analytics are always logically independent from advertising; ad flags stay OFF.

## Q. Verifiable sources (checked 2026-10-30)

1. Fly pricing (Machines, Managed Postgres): https://fly.io/pricing/
2. Fly Next.js deployment: https://fly.io/nextjs/
3. Fly background workers/process groups: https://fly.io/learn/background-workers/
4. Fly fuzzy scheduled Machines (not selected for exact 09:00 digest): https://fly.io/docs/machines/flyctl/fly-machine-run/
5. Neon free plan (check current quotas): https://github.com/neondatabase/website/blob/main/content/faqs/free-plan-limits-and-quotas.md
6. Resend pricing: https://resend.com/pricing
7. Resend marketing vs transactional use and unsubscribe: https://www.resend.com/pricing?product=marketing
8. Resend emails idempotency: https://resend.com/changelog/idempotency-keys
9. Resend webhook verification: https://resend.com/changelog/managing-webhooks-via-api
10. Resend Acceptable Use Policy: https://resend.com/legal/acceptable-use
11. selfh.st apps docs: https://selfh.st/apps-about/
12. Historical selfh.st mirror (provenance unverified): https://github.com/rocketnova/selfhst-apps
13. CRTC CASL: https://crtc.gc.ca/eng/com500/faq500.htm
14. RFC 8058 one-click unsubscribe: https://www.rfc-editor.org/rfc/rfc8058.html

**Implementation instruction:** Implement and validate the phases in order. Do not add deferred features or expose “vulnerable/safe to upgrade” claims. Use real verified data contracts instead of guessing source fields or endpoints.


### 2026-10-30 authoritative agent-tool references

- Fly MCP limitations: https://fly.io/mcp/
- Fly CLI CI guide: https://fly.io/docs/flyctl/integrating/
- Neon MCP (development only): https://neon.com/guides/neon-mcp-server-github-copilot-vs-code
- Neon CLI tooling: https://neon.com/blog/just-landed-in-the-neon-cli
- Resend remote MCP: https://github.com/resend/resend-mcp
- GitHub official Codex integration: https://github.com/github/github-mcp-server/blob/main/docs/installation-guides/install-codex.md


## L. Final product identity and email-domain readiness gates

**LabTicker** is the only customer-facing product name; avoid legacy placeholder branding. Do not purchase a custom domain during MVP. Fly app slug and public hostname must be **discovered**, not inferred; `https://labticker.fly.dev` is only a preference contingent on availability.

Application configuration must include:

```dotenv
APP_NAME=LabTicker
# Replace with actual deployed Fly hostname; value below is only an example.
APP_URL=https://labticker.fly.dev
AUTH_URL=https://labticker.fly.dev
EMAIL_DELIVERY_MODE=mock
PUBLIC_EMAIL_ENABLED=false
ADS_ENABLED=false
```

`APP_URL` is authoritative for link generation, webhook registration, magic-link callbacks, unsubscribe links, sitemap, canonical tags, OpenGraph metadata, rate-limited share links, and allowlisted origins. All real URLs must be derived from environment configuration after Fly app creation; no local hard-coded production hostnames. Check OAuth callback and auth trusted host settings after final hostname resolution. Use a single stable canonical `https://` origin.

**Split launch criteria:** (A) deploy website + catalog + dashboard + analytics + worker in test-email mode on Fly; (B) enable real authenticated email registration and digest delivery only after sender-domain ownership and SPF/DKIM/DMARC verification, consent handling, unsubscribe, webhook signatures and real-recipient tests pass. Providing a web `fly.dev` hostname does not satisfy (B).

See `10_LABTICKER_IDENTITY_AND_DOMAIN_ROLLOUT.md` for the complete checklist and later optional custom-domain migration.
