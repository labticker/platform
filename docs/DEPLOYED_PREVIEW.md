# Deployed catalog preview

Verified 2026-11-01 UTC at https://labticker.fly.dev.

- Public source: https://github.com/labticker/platform
- Allocation: owner-approved run 41240979005, successful retry after credential expiry.
- Deployment: owner-approved run 41256323591, successful public HTTPS smoke.
- Source SHA: 61c8d56ac05b057ca2581c749cae722d85bd1cb9.
- Image: registry.fly.io/labticker:61c8d56ac05b057ca2581c749cae722d85bd1cb9.
- Image digest: sha256:545d8c360d37b105ec23eaa55592b86035cd6e56552daca402703b75217c2edd.
- One shared-cpu-1x web Machine, 512 MB, Toronto yyz; no worker Machine.
- Fly-managed HTTPS, shared IPv4 and IPv6. No custom DNS or purchased domain.
- Mock email only; public sign-in, worker, advertising and analytics ingestion disabled.
- No database credentials or OAuth credentials are installed in this preview.

GitHub CI, deployment checks and assigned-origin smoke pass. Fly HTTP health passes and reports
preview/mock/workerReady:false. Live Playwright browser acceptance verifies 50 catalog entries,
Jellyfin search, zero third-party requests, zero analytics storage and closed public sign-in.
The workstation's upstream resolver temporarily cached NXDOMAIN; browser acceptance used a
session-only host mapping to Fly's assigned IPv4 with normal TLS validation. Cloudflare DNS
resolved both public records and GitHub's normal public DNS/HTTPS smoke passed independently.
No machine-wide DNS configuration or hosts file was changed. Browser sessions were closed.

Run scripts/live-preview-browser-acceptance.js through Playwright CLI for UI verification and
PREVIEW_ORIGIN=https://labticker.fly.dev pnpm exec tsx scripts/smoke-preview.ts for HTTP checks.
The scripts do not send email, enroll accounts or modify production data.

Both temporary provisioning tokens were revoked and the infrastructure secret removed after
allocation. The app-scoped production deploy token expires 2026-11-08 UTC; rotate it directly into
the protected production environment before the next deployment after expiry. Never print it.

This is the first release: there is no prior compatible production image to roll back to yet.
Record the image above before the next rollout. On failure, follow the protected redeploy runbook;
do not run database downgrades. Production application migrations have not been applied.

## Usable monitoring pilot remains separate

The owner created the GitHub OAuth app and stored its client ID/secret in protected GitHub secrets.
The session secret was generated and transferred without printing its value. OAuth implementation
is in draft PR #1 with passing CI, not deployed or enabled. The pilot still needs reviewed merge,
accepted production migration/runtime roles, catalog/worker rollout, real OAuth callback/session
acceptance, privacy/retention decisions and PostHog project/MCP acceptance. The official PostHog
connection still fails transport before any analytical query can run. Do not call this preview a
working monitor/digest service or mark the overall MVP/any phase complete. Live email remains a
separate verified-sender prerequisite.
