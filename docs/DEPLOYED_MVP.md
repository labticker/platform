# Deployed monitoring MVP: private owner acceptance

Verified 2026-11-01 UTC at https://labticker.fly.dev.

- Public repository: https://github.com/labticker/platform.
- Owner-approved deployment: https://github.com/labticker/platform/actions/runs/41337594044, successful.
- Source/image tag: 956a39ccfb733b5a2fd1544f2df95d45c42eb903.
- Image: registry.fly.io/labticker:956a39ccfb733b5a2fd1544f2df95d45c42eb903.
- Image digest (both processes): sha256:10a53129a4319bfaeae5b4004f9312f418b0ec8141f103406fda02cc1267ccf2.
- One 512 MB shared-cpu-1x web Machine, 80e470a6590d91, Toronto yyz.
- One 512 MB shared-cpu-1x worker Machine, 8e7ed9a769e404, Toronto yyz.
- Neon migrations 0000–0008, scoped web/worker/report roles, owner-only GitHub OAuth, mock email.
- No custom domain/DNS, paid Neon upgrade, live email, audience ingestion or advertising activation.

## Executed acceptance

Protected production checks pass: 95 tests, typechecks, catalog validation/build, PostgreSQL roles and actual ephemeral Actions-token public-release preflight. Backup clone br-snowy-bird-b5te6g01 was verified ready and bound to the main migration endpoint before migration. It is a no-compute pre-deployment data clone; no actual restoration drill is claimed. The initial run 41336535081 stopped before deployment because of an overly strict token pattern. PR #2 fixed it, with explicit owner merge authorization and new protected production approval.

Catalog bootstrap result: 50 entries, 50 polled, zero failures, 50 ready, zero unpolled. Initial release history is baseline, not new email. The two Fly groups use the exact same digest. Public health reports owner-acceptance, databaseReady=true, workerReady=true, signInEnabled=true, ownerAccessOnly=true, analyticsEnabled=false and emailDeliveryMode=mock. This observes a completed durable worker tick, not merely a running process.

Real-browser HTTPS acceptance passes searchable catalog, Jellyfin release history, private-acceptance disclosure, GitHub as the only provider, disabled email sign-in, private digests/report 401 and mock inbox 404, with zero third-party request attempts and zero analytics storage. The live release detail also passes a 390-pixel mobile overflow check. Run scripts/live-mvp-browser-acceptance.js via Playwright CLI from a fresh about:blank browser; it reads public data only and does not log in or create records.

The encrypted local aggregate-report helper authenticates to the fixed HTTPS endpoint and confirms ten-count small-cell suppression. Traffic is correctly unavailable in noop analytics mode; missing measurement is not zero. No raw production subscriber records or SQL were accessed by the agent.

## Owner verification and public gates

The real OAuth round-trip requires the owner to open /auth/sign-in and continue with GitHub. Then select three applications, save timezone/cadence/consent and inspect /digests, /admin and /admin/operations. This is manual acceptance, not inferred from the provider listing or health endpoint. A scheduled release-to-mock receipt must be observed after an actual new upstream release; do not insert synthetic production releases.

Public catalog/release pages can be shared, but account creation remains restricted to the configured GitHub owner ID. Public pilot enrollment still requires actual PostHog privacy/configuration/ingestion and official MCP acceptance. Workstation filtering currently blocks the MCP hostname; an owner allowlist or narrow explicit exception remains pending. Live email independently requires the chosen verified sender/contact, credentials/webhook setup and explicit rollout/test approval. Opens stay disabled and unreliable estimates if enabled later. No ads may be activated before a separate explicit post-PMF owner decision.

## Rollback and limits

The previous catalog-preview image is recorded in DEPLOYED_PREVIEW.md. Rollback must be protected and owner-approved, use the compatible preview configuration, and explicitly pause/scale down the worker. Do not assume the preview workflow stops an existing worker. Preserve additive SQL; never automatically down-migrate or restore the empty pre-deployment clone over later owner data. Validate recovery in isolated staging and obtain explicit production recovery approval.

Scoped SQL clients do not isolate app-wide Fly secrets from a compromised process. The earlier 512 MiB local load smoke was twenty requests at concurrency four, not a cloud capacity certification. Broader recovery, load, provider and public-pilot acceptance remain open. The seven-day deployment credential needs renewal before its recorded expiry.
