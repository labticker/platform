# MVP rollout and acceptance

The public production site is currently the catalog preview. This runbook prepares the full monitoring application; it does not assert it has deployed. Canonical progress and test evidence are in IMPLEMENTATION_STATUS.md.

## Private owner acceptance

The default deploy.yml stage is owner-acceptance. It enables GitHub OAuth only for ADMIN_GITHUB_ACCOUNT_ID, including checks on existing sessions, and starts one 512 MB web and one 512 MB worker Machine. Email remains mock, analytics noop and advertising compiled off. Other GitHub identities are denied before account creation. This is private acceptance testing, not public pilot enrollment. Visitors can continue browsing public app/release information.

1. Review migrations 0007 and 0008 and the entire PR, wait for required CI, then merge through branch protection. These changes preserve previous catalog identities, release history and selections. Existing mock receipts are explicitly tagged mock.
2. Inspect actual Fly counts and Neon Free branch/storage quota. The approved budget covers one web and one worker; no paid Neon upgrade is permitted. Record the current compatible preview image from docs/DEPLOYED_PREVIEW.md. Verify the existing app-scoped token has not expired.
3. Dispatch Approved LabTicker monitoring MVP rollout from main with app=labticker, rollout_stage=owner-acceptance, email_delivery_mode=mock, analytics_enabled=false, email_auth_enabled=false. On the initial rollout choose bootstrap_runtime_roles=true and bootstrap_catalog=true. Supply explicit migration/role/deployment approval and backup evidence references. Choose create_backup=true only after approving a no-compute Neon clone within quota, or supply a freshly reviewed clone ID.
4. The protected production Environment waits for the owner approval click. The workflow repeats tests, validates configuration, checks a fresh main clone and endpoint binding, applies additive migrations, applies scoped roles, stages credentials through stdin, imports the catalog/baseline and deploys a single SHA image to both groups. No automatic SQL runs at application startup.
5. Confirm actual Fly process counts, /api/live and /api/health owner-acceptance with workerReady=true. Sign in as the owner, choose three applications, save cadence/timezone/consent, inspect private digest/sample history and admin operations/PMF. Test a non-owner GitHub account is denied. A successful HTTP smoke cannot prove the actual OAuth callback.
6. Wait for a new upstream release after monitoring begins, or use an isolated synthetic staging fixture, and confirm a mock intent/receipt. Baseline history must not be mailed as new. Do not fabricate a release in production. Mock records are visible to the signed-in recipient but never counted as actual delivery.

The bootstrap polls a bounded recent history (100 releases/source); asset-heavy pages use 20-item pages and bounded safe HTTP. It may expose partial-source failures honestly instead of hiding the catalog. Initial seeding may take minutes. Every subsequent worker tick syncs the stable registry, polls five due sources, prepares/simulates due digests, refreshes aggregates and prunes eligible operational data. A first tick must finish before readiness passes.

## Public pilot gate

Do not change OWNER_ACCEPTANCE_ONLY manually. Select public-pilot only after the cookieless PostHog project, privacy settings, authorized SDK ingestion and official MCP analytical read are accepted. Configuration requires the approved US/EU public ingestion host, public project key, numeric project ID, earliest measurement date and private read-only query key. The worker executes fixed aggregate SQL and stores daily counts only. Traffic before measurement began is unavailable, not zero.

The official PostHog MCP hostname is currently blocked by the workstation DNS filter. Obtain owner allowlisting or a narrowly authorized exception; do not bypass it implicitly. Publishing a private acceptance build does not satisfy the mandatory public-pilot analytics requirement.

## Independent live-email gate

Fly hosting is not a sender domain. Keep mock until the owner chooses a verified sender address, reply/contact details and sender identity, approves consent-based digests and an owner-only test, and privately installs Resend SDK/webhook credentials. Store EMAIL_ROLLOUT_APPROVAL_JSON in protected secrets using the contract in packages/notifications/src/resend.ts, with explicit matching owner decision/reference and untracked sender evidence. No credential values belong in issues or chat.

Live deployment requires email_delivery_mode=resend and the matching approval reference. Optional EMAIL_AUTH_ENABLED needs the same verified untracked sender and its own explicit workflow switch. Authentication messages contain no analytics, sponsorship, digest subscription or tracking. Their acknowledgement ledger contains only provider ID/time so their webhook events cannot inflate digest metrics. Opens remain disabled unless independently approved/disclosed as unreliable estimates. Never send a marketing broadcast during testing.

## Roles, reporting and credentials

WEB_DATABASE_URL serves ordinary authenticated web operations; WORKER_DATABASE_URL serves polling/queue/report writes; REPORT_DATABASE_URL can read only analytics_daily_aggregates. No production Neon MCP access is permitted. These are SQL capability boundaries for normal clients, not OS isolation: Fly secrets are app-wide in this single-app deployment. Do not claim a compromised web process cannot access the worker secret.

The production aggregate HTTP interface accepts only a fixed date range, suppresses small cells and never accepts arbitrary SQL/user IDs. scripts/read-aggregate-report.ps1 reads its bearer token from a local DPAPI-encrypted file initialized by scripts/initialize-aggregate-access.ps1. The latter installs the same value directly into protected GitHub secrets. Neither prints the value. Private admin reporting is authenticated and may show owner small counts; the AI endpoint does not expose that override.

## Failure and rollback

A failed migration or backup check stops the workflow before deployment. No automated down-migration is allowed. Role bootstrap refuses existing roles; if staging succeeds and the SQL transaction subsequently fails, reconcile the staged credentials explicitly before retrying. Re-running bootstrap blindly is not recovery.

For an application regression, pause worker processing and use a protected owner-approved workflow change to deploy the recorded compatible previous image/config. The catalog-only preview configuration has no DB worker and is the safe initial fallback. Do not automatically erase newly applied additive schema. For data recovery, restore the verified clone to isolated staging, test counts/constraints/receipts, reconcile any ambiguous provider dispatch, then seek explicit production recovery approval. A fresh clone attestation states restoreTested=false unless an actual restore drill was executed.

No workflow buys a domain, changes custom DNS, provisions paid Neon capacity, activates advertising or interprets analytics as a PMF declaration.
