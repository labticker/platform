# LabTicker — Product MVP Plan

**Status:** LabTicker v0.6 — brand finalized; free `fly.dev` web launch; open-source community catalog and AI-assisted operations  
**Prepared:** 2026-10-30 (updated for LabTicker / `fly.dev` launch)  
**Business model:** Free release alerts and ad-free launch. Build dormant advertising interfaces in MVP; no actual ads, affiliate promotions, or sponsorships until the owner confirms product-market fit and separately approves activation.  
**Infrastructure preference:** Fly.io web + worker at `https://<actual-app-name>.fly.dev`; Neon PostgreSQL; Resend after sender verification; PostHog cookieless analytics; GitHub Actions; Codex with official MCP tools. No purchased LabTicker domain required to develop or launch the website.

## 1. Executive summary

Build **LabTicker**, an open-source, curated release-monitoring service for homelab users. People select applications from a searchable, homelab-focused directory, choose **daily** or **weekly** digests, and receive consolidated update emails with release notes and conservative rule-based warnings. Users should not have to find individual GitHub repositories, install local agents, or configure RSS themselves.

The **product** is not a vulnerability scanner or an AI assistant. It is a convenience and attention-management product. **Codex is used to develop and operate the service**, but no customer-facing AI feature is required for v0.1. The company and product are open source.

**Brand tagline:** “Update your homelab. Without the homework.”  
**One-sentence value proposition:** “Choose the software in your homelab once, and receive one readable email whenever it updates.”

### Why someone would choose it

- Curated catalog: no need to know repo names or tag conventions.
- One-click monitoring, grouped around recognizable applications.
- Stable-release updates, consolidated rather than dozens of notifications.
- Release notes and upstream links in each digest.
- Conservative indicators for possible breaking changes, migration steps, and major versions.
- Simple preference settings and straightforward unsubscribe.

## 2. Core scope — version 1

| Included | Deferred |
|---|---|
| Open-source public GitHub organization, contributor docs, governance | CVE / security advisory monitoring |
| Community-curated JSON registry alongside selfh.st | Automatic external user-submitted source activation |
| Public landing page | AI customer-facing summaries |
| Searchable catalog, category filtering | Installed-version discovery or automatic homelab scanning |
| Email signup and verification | AI summaries and tailored upgrade instructions |
| Add/remove monitored apps | Paid subscriptions and billing |
| Daily / weekly digest preference | Discord, Telegram, push, or webhooks |
| Stable-release intake and deduplication | Multi-user teams and integrations |
| Release title, version, date, concise notes + source link | Custom per-user notification timing beyond sensible defaults |
| Possible breaking/migration/major-version flags | Guaranteed compatibility/safety assessment |
| Inactive, testable first-party email sponsor slot and campaign model; globally gated OFF | Selling, selecting, scheduling, or displaying real email ads |
| No-op public-page website ad slot and future provider interface; globally gated OFF | Live AdSense/Carbon/EthicalAds tags and network approval/activation |
| Self-service unsubscribe, preferences, account deletion | Native mobile applications |
| Minimal admin catalog and campaign controls | Public API |

**Explicit exclusions:** The MVP must not claim that a release is safe to install, that users are or are not vulnerable, or that regex detected every breaking change.

## 3. User journeys

### New visitor

1. Visit landing page and view a few examples of software in the catalog.
2. Search for Proxmox VE, Immich, Home Assistant, Jellyfin, Uptime Kuma, etc.
3. Create an account with an email magic link **once a verified sending domain is configured** (use test-mode sign-in or an explicitly configured alternate OAuth provider for development until then), and opt in to receive release-update digests. Do not advertise sponsored content during initial signup as a live feature; if future sponsored email is proposed, obtain and record any additional consent required before activating it.
4. Select at least three apps to monitor.
5. Choose **Daily** or **Weekly**; default Weekly.
6. See confirmation and a sample digest preview.

### Returning user

1. Open dashboard to view monitored apps.
2. Add/remove apps with a single click.
3. Change digest frequency and timezone, or pause email.
4. Review recently detected release history from the dashboard.

### Receiving a digest

1. Receive a single email containing updates from selected software that have not previously been delivered.
2. Each entry includes app name, release/tag, published date, short release-note excerpt, potential warning labels, and official link.
3. **For MVP/beta, no advertisements or affiliate placements appear at all.** The email template has an inactive, feature-flagged sponsor extension point for later use. Website ad-network snippets never appear in email.
4. Footer includes the sender's identity, contact information, preference link, and one-click unsubscribe.
5. Do not send empty digests just to display an advertisement.

## 4. Functional requirements

### Directory

- Import verified upstream catalog data **and** Git-tracked `catalog/services/*.json` into **our own database**, with stable internal IDs independent of upstream slugs.
- Search name, aliases and description; category filters and monitored-only filter.
- Support GitHub PR addition/editing of custom JSON-defined entries; internal admin hiding, renaming, aliasing and source correction. A maintained JSON override takes precedence over imported metadata.
- Retain subscribers and previous releases when upstream naming/metadata changes. Never remove subscriptions when an upstream service disappears or is renamed.
- Show clear “No supported release feed” or “Feed temporarily unavailable” states instead of implying tracking is complete.
- Link to upstream project and release page; use icons only when licensing is verified.

### Monitoring

- Poll stable-release feeds on a configurable cadence; keep ETag/Last-Modified when supported.
- Process feeds once per project regardless of follower count.
- Deduplicate releases by source GUID or canonical URL, falling back to normalized tag + app ID.
- On initial import, store feed history but do **not** email everyone about old releases.
- Keep raw/source metadata and canonical release URLs.
- On transient fetch failure, keep past data and retry; never delete an app or release because one fetch failed.

### Classification

- `major_release`: only for reliable semver parsing; do not interpret Calendar Versioning as semver.
- `possible_breaking_change`: look for explicit `BREAKING CHANGE`, `breaking changes`, `not backward compatible`, etc., with simple negation handling.
- `migration_mentioned`: match `migration required`, `manual migration`, `schema migration`, or explicit upgrade steps.
- `deprecation_mentioned`: match `deprecated`, `removed`, or `no longer supported` in context.
- `security_wording_mentioned`: optional generic release-note label only, **not** vulnerability monitoring or CVE assessment; can be omitted until reviewed.
- Every warning is advisory only, shows evidence text, and links to the original notes.

### Digest behavior

- Frequencies: daily or weekly, default weekly, with an enabled/paused setting.
- Default delivery: 09:00 in user's saved IANA timezone; weekly on Monday. More precise hour/weekday customization deferred.
- Compute due times based on timezone including DST changes; store next UTC due timestamp.
- Include updates first detected **after the user subscribed to the app** and not previously delivered to that user.
- A digest covers the relevant elapsed window and rolls any failed deliveries forward rather than discarding them.
- On frequency change, recompute next due time without duplicating already delivered releases.
- Sort warnings first, followed by release time; cap visible note excerpts, with links to full source.
- No update -> no email; mark the window processed so the scheduler does not repeatedly retry it.

### Accounts and compliance

- Email sign-in with short-lived magic link; never store a password in the MVP.
- Record express opt-in details, text version and timestamp; avoid silently opting contacts back in.
- Store sender identity and contact details; implement preference management and unsubscribe independently from login.
- Unsubscribe is available without signing in and immediately suppresses marketing emails.
- Handle bounced, complained and suppressed addresses via Resend webhooks.
- Implement account deletion, including removal of preferences and marketing data subject to required compliance retention.
- No sale of user email addresses or third-party audience tracking in version 1.

### Advertising foundation (code only, no launch ads)

- Implement the optional first-party email sponsor template, campaign schema and admin-only draft/preview flow, but **do not permit active campaigns or production ad rendering** until product-market fit is reviewed and owner approval is recorded. No ad sales, affiliate promotions or network requests during MVP/beta.
- Keep all web ad networks out of the email-rendering pipeline.
- Provide a website ad placement interface backed by a `none` provider. A future `adsense` adapter can be added when monetization is authorized; **no advertising network scripts, pixels, cookies or ad requests are loaded** in MVP/beta.
- Carbon and EthicalAds are later *alternative* website providers. Carbon publisher terms prohibit using it as backfill alongside AdSense.
- For complete research, activation gates and tests, read `08_AD_MONETIZATION_PLAN.md`.
- The renderer supports at most one labeled sponsor placement per email **only after monetization activation**; it must render none throughout MVP/beta.
- Sponsor content cannot masquerade as a release, security warning, or platform endorsement.
- Preserve a campaign ID per digest for basic accounting.
- Basic impressions = successfully accepted sponsored emails; avoid claiming human views.
- Optional click counting using a privacy-conscious first-party redirect; no tracking pixel required.
- Never insert ads into magic-link authentication messages.

## 5. MVP UX and pages

| Page | Contents |
|---|---|
| `/` | Value proposition, example software, sample digest, signup CTA |
| `/apps` | Catalog search, filters, monitor toggles |
| `/apps/[slug]` | Original app overview, source links, recent stable releases, monitor action; eligible optional website ad slot after provider approval |
| `/dashboard` | Selected monitors, latest activity, change monitors |
| `/settings` | Digest frequency, timezone, pause/resume, consent/account controls |
| `/auth/sign-in` | Email magic-link request |
| `/unsubscribe` | Public confirmation UI and post action |
| `/privacy`, `/terms` | Privacy, sender and product disclosures |
| `/admin` | Protected catalog sync status, releases, campaigns, manual corrections |

**Visual intent:** Clean, technical, responsive UI. Make search and monitor selection the central interaction. On mobile, show a compact searchable list. Use badges sparingly; warning labels must not look like verified security alerts.

## 6. MVP success criteria

### Product acceptance (all required)

- At least 50 carefully verified self-hosted applications can be monitored.
- A new user can sign up, select 3 apps and choose a cadence in under 3 minutes.
- Daily and weekly digest scheduling works across timezone/DST changes.
- Releases are not duplicated on rescans, restarts, or email retries.
- Each release email has an official upstream link and a successful unsubscribe mechanism.
- An unavailable source does not delete or corrupt prior state.
- Admin can pause a feed, fix mapping and see last successful synchronization.
- The entire application can be deployed to Fly.io from version control and recovered from documented database backups.

### Measurement targets (hypotheses, not forecasts)

- 100 beta signups and at least 60% of signups monitoring three or more apps.
- 30-day active monitoring retention above 50% among beta users.
- Fewer than 1% manual source corrections in a normal weekly run after stabilization.
- No unexplained duplicate digests in beta.
- Positive qualitative feedback that curation saves meaningful setup time.

**Analytics is mandatory at MVP launch.** Deploy PostHog in cookieless/no-person-profile mode for web acquisition and interaction; use signed Resend webhooks and first-party Neon aggregates for authoritative activation, retention and delivery. Use official PostHog MCP and a restricted aggregate-only read API/MCP so Codex can analyze performance. Report email opens only as an optional, disclosed **estimated** metric; Apple Mail Privacy Protection makes them unreliable. Track clicks as a stronger, but imperfect, engagement indicator. Details: `09_ANALYTICS_AND_PMF_PLAN.md`.

**Do not enable ads** as part of analytics launch. Analytics data does not itself authorize advertising or monetization.

## 7. Rollout and revenue

**Pilot and public beta:** Free and entirely ad-free. Do not apply for or activate advertising networks as an MVP deliverable. Do not show email sponsorships or affiliate placements. Build and test the disabled ad interfaces without making requests to advertising networks.

**After product-market-fit review:** Consider activating monetization only by an explicit owner decision. Assess retention, engagement and qualitative feedback first; then choose a provider, obtain necessary network approvals, user consent and privacy reviews, and deploy an activation change. The presence of code or a network approval alone never authorizes ads. See `08_AD_MONETIZATION_PLAN.md`.

**Future phase:** Optional AI-assisted instructions based on a user's installed version; paid tier only after users demonstrate demand.

### Operational financial guardrails

- Pay for stable delivery before adding complexity. The Resend free limit of 100/day can be reached even at modest weekly-digest scale if most digests send on the same day.
- Set a monthly budget threshold and send-queue capacity guard; do not silently discard scheduled emails when quotas are reached.
- No unsupported forecast that advertising will pay for the service. A new website may earn $0 pending network approval/traffic; affiliate earnings also require eligible conversions.
- Carbon currently begins review around 10,000 monthly pageviews and requires site-ad-network exclusivity; do not implement Carbon as AdSense backfill.

## 8. Open-source identity, community data and agent-driven operations

- Create a dedicated **GitHub organization** for the project, with a public `platform` monorepo and an optional `.github` organization-profile repository. Do not call a GitHub organization a separate legal entity; incorporation and trademarks are separate decisions.
- License application/server/worker code under **AGPL-3.0-only** as the proposed default for an open-source hosted SaaS, pending legal review. License original contributed catalog metadata under **CC0-1.0** with contributor acknowledgement. Consider MIT/Apache-2.0 if maximizing unrestricted adoption matters more than reciprocal SaaS source sharing.
- Publish `LICENSE`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `GOVERNANCE.md`, `CODEOWNERS`, `README.md`, and a public roadmap. Keep secrets, personal information, customer data, credentials and infrastructure tokens private.
- Keep the **one repository, two deployable processes** model for MVP: Next.js web/API plus a separate Fly worker. Catalog ingestion, release polling and digest preparation are modules inside the worker. Microservices are a future extraction strategy, not a requirement to split into many repositories at launch.
- Maintain a versioned `catalog/schema/service.schema.json` and `catalog/services/<slug>.json`. Contributors propose additions through PRs. CI validates schemas, IDs, source formats and unsafe URLs; maintainers review before merging; merge triggers a safe catalog sync.
- Merge priority: explicit local JSON override > trusted upstream selfh.st metadata > curated fallback. Preserve provenance and avoid overwriting maintained local fields with empty upstream values. No external feed should be assumed to be an authorized commercial API.
- Codex is the primary implementation assistant. Official GitHub, Fly, Neon, and Resend MCP endpoints exist, but they have different capabilities. **Fly MCP does not deploy applications; use `flyctl` and GitHub Actions. Neon MCP is development-only.** Code-based CI, pinned dependencies and verified migrations are the source of truth.
- Keep approval gates on production database migrations, sends to real subscribers, credential creation/rotation, billing/resource creation, service deletion and production releases. Codex can prepare changes and open PRs, and routine approved merges can deploy through CI.

For full details see `04_OPEN_SOURCE_CATALOG_SPEC.md`, `05_AI_MCP_OPERATIONS.md`, `06_ORG_CONTRIBUTOR_SETUP.md`, `08_AD_MONETIZATION_PLAN.md`, and `09_ANALYTICS_AND_PMF_PLAN.md`.

## 9. Dependencies and explicit launch gates

1. **selfh.st access and rights:** Verify a currently maintained, canonical machine-readable source, commercial-reuse rights and stable feed URL format. The formerly used `github.com/selfhst/apps` location is not currently resolvable. An independent mirror exists but must not be assumed authoritative or current. Contact the maintainer if appropriate. If unresolved, ship with an independently curated 50–100 app catalog and upstream project release feeds.
2. **Resend policy:** Verify that marketing-consented personalized sponsored digests using `/emails` and self-managed unsubscribe meet current Resend requirements. Current docs permit newsletters via either Emails or Broadcasts, subject to consent/unsubscribe requirements.
3. **Domain authentication:** SPF, DKIM and DMARC correctly configured, plus sender postal/contact identity in footer.
4. **Reliable worker:** Cron scheduling, retries, locking, test-mode email and alerting proven on Fly.
5. **Legal disclosures:** Privacy policy, terms, consent language and affiliate disclosures reviewed before accepting public subscribers; consult Canadian CASL and other applicable jurisdictions.
6. **PMF and monetization gate:** Before product-market fit is explicitly declared by the owner, no ad content, affiliate placement or ad-network script is ever served, regardless of provider credentials. Afterward, separate publisher approval, user consent and privacy/CMP checks still apply before any activation.

## 10. Source references (checked 2026-10-30)

- selfh.st directory/about: https://selfh.st/apps/ and https://selfh.st/apps-about/
- Historical catalog mirror and README: https://github.com/rocketnova/selfhst-apps (verify provenance/maintenance)
- Fly.io pricing: https://fly.io/pricing/
- Fly.io worker process groups: https://fly.io/learn/background-workers/
- Resend pricing/segmentation: https://resend.com/pricing
- Resend newsletter sending modes: https://www.resend.com/pricing?product=marketing
- Resend AUP: https://resend.com/legal/acceptable-use
- Canada CASL requirements: https://crtc.gc.ca/eng/com500/faq500.htm

---
**Decision record:** v1 is free, **ad-free** release monitoring **with privacy-preserving analytics and AI-readable aggregate PMF dashboards**, with dormant and tested website/email advertising interfaces for later. Monetization activation is **deferred until an explicit product-market-fit decision and further owner approval**. CVEs/security intelligence, customer-facing AI, and paid plans are also deferred.


### New supporting references (2026-10-30)

- Official Fly MCP (capabilities and deployment limitations): https://fly.io/mcp/
- Fly CI/CD: https://fly.io/docs/flyctl/integrating/
- Neon MCP security: https://neon.com/guides/neon-mcp-server-github-copilot-vs-code
- Resend MCP: https://github.com/resend/resend-mcp
- GitHub MCP for Codex: https://github.com/github/github-mcp-server/blob/main/docs/installation-guides/install-codex.md


## LabTicker launch identity and domain decision (binding)

- The product is named **LabTicker**; use that name in page title, navigation, emails, GitHub metadata, default app labels, and documentation. Preferred tagline: **“Update your homelab. Without the homework.”**
- Preferred GitHub organization is `labticker` (handle availability has **not** been verified); repo `platform`, public. Codex must test handle availability and request approval before choosing a different organization handle.
- Preferred Fly app name is `labticker` (name is not reserved or guaranteed available). Its hostname would be `https://labticker.fly.dev` **only if Fly allocates that app name**. Otherwise use an owner-approved fallback name and inject its **actual** `.fly.dev` URL via configuration. Do not hardcode a guessed hostname or buy a domain.
- No custom LabTicker domain, Namecheap registration, domain renewal, custom DNS, `fly certs add`, or custom-domain redirect is part of MVP launch. All app links (authentication callbacks, email CTA, unsubscribe, privacy, webhook endpoint) must use the actual `APP_URL` and be configurable.
- **Website hosting and outgoing email domains are separate:** Fly's `.fly.dev` hostname does not give us permission to send from `@labticker.fly.dev` or configure Resend DNS records. Public outbound email requires a **verified sender domain that the owner controls** (which can be an already owned domain, rather than a new LabTicker domain). Until that is configured, mock/test email and development-only verified-recipient paths work, but real subscriber magic links and digest delivery must not be advertised as operational.
- Clearly distinguish **website ready** from **public email ready** in the launch checklist and CI smoke tests. See `10_LABTICKER_IDENTITY_AND_DOMAIN_ROLLOUT.md`.
