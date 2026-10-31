# Deployment preparation — not executed

The Docker image, Fly example config and manual Actions workflows are reviewable preparation.
No cloud app allocation, production migration, deploy or recovery drill has been executed by these files. A Linux image was built and production-container smoke-tested locally; the final digest-pinned/telemetry-disabled image rebuilt successfully from code revision eb14c15 and passed production-container smoke checks.
Official sources checked: https://fly.io/docs/flyctl/integrating/ and https://fly.io/docs/reference/configuration/.
Fly CLI is pinned to 0.5.1; checkout/setup-node/pnpm actions use resolved commit SHAs. Node and pnpm are pinned.

Before enabling workflows, create the approved public platform repository, protect main with CI/review and
configure production and infrastructure Environments with required owner reviewers, prevent self-review,
and main-only deployment branches. Environment protection is an account setting; YAML cannot establish it.
Review current Fly quota/billing and authorized organization. No workflow buys domains or configures DNS.

Run Owner-approved Fly app allocation only with a reviewed slug/organization and budget approval reference.
Its organization-scoped provisioning token belongs only in the protected infrastructure Environment. It
calls flyctl apps create; failure because a slug is taken requires approved alternatives, not silent renaming.
It creates no Machines, addresses, volumes or databases. Record assigned identity and actual fly.dev origin.

Use a separately scoped expiring app deploy token in production. Set DATABASE_URL as a Fly secret,
and MIGRATION_DATABASE_URL only as a protected Actions secret. Never grant production Neon MCP access.
Before migrations, verify an actual backup/restore path and attach its reference plus reviewed migration diff
and deployment approval. The protected deployment runs tests, applies Drizzle migrations, deploys a single
SHA-labelled image for web/worker definitions and checks web health at the assigned hostname. Failures stop
the workflow; migration failure is sanitized. No destructive migration reversal is attempted. The preview
deploy passes `--process-groups web` (verified in installed flyctl 0.5.1 help), so merely declaring the
worker group cannot create a new disabled worker Machine during this preview. It does not stop/remove
any pre-existing worker Machine; inspect existing process counts before approving a deployment.

The image retains source and pinned tsx so workspace TypeScript exports work without unsupported compiled
Node imports. It currently retains build dependencies for reproducibility; runtime size reduction is pending.
Local Docker build/smoke evidence now exists; Fly runtime behavior still needs execution. The Fly example intentionally has
WORKER_ENABLED=false. Before worker Machines are started, independently accept the selected mock queue
mode and configure its secrets. A disabled worker process exits; do not interpret that as worker readiness.
Review process counts explicitly and authorize the cost of one web plus one worker before full rollout.

The deploy template is a web/mock preview only. APP_URL/AUTH_URL derive from the actual input slug;
worker polling/queue integration, production analytics project activation and strict source/worker freshness
smokes remain acceptance gates. Analytics cannot be considered launched from web HTTP success alone.
No public email sender exists merely because Fly allocated a hostname. All ads/sponsors stay off.

Rollback: record the previous compatible SHA-labelled image and migration IDs before deployment. After
owner approval deploy that exact prior image with flyctl deploy --image <recorded-image> --config fly.toml.
Keep database changes additive and backward-compatible; do not automatically downgrade SQL. On data
damage pause worker processing, restore backup to isolated staging, validate constraints/receipt dedupe,
then obtain protected production recovery approval. Reconcile provider sends before requeueing ambiguity.

Before launch additionally prove actual assigned Fly HTTPS links, secret isolation, Neon dev migration and
restore, worker heartbeat/process counts, release-to-mock receipt flow, no ad network requests and cookieless
analytics privacy. Configure proxy query redaction separately from Next development logging.
