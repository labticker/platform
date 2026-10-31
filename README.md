# LabTicker

**Update your homelab. Without the homework.**

Open-source release monitoring for homelab software. This repository is under implementation; it is not a launched email service. The service is free and launches ad-free. See [implementation status](IMPLEMENTATION_STATUS.md), [contributing](CONTRIBUTING.md), and the authoritative numbered plans.

The architecture is one pnpm/Turborepo monorepo: Next.js web/API, one worker with catalog/release/digest modules, Drizzle/Neon PostgreSQL, and Resend. The Git-tracked JSON catalog works independently of selfh.st.

Local foundation checks: `pnpm install`, `pnpm catalog:validate`, `pnpm test`, `pnpm typecheck`. Consult package scripts as implementation grows. No production credentials are needed for offline fixture checks.

Web deployment will use the actual assigned Fly HTTPS hostname. No domain purchase or custom DNS is required. Public email login and digests remain disabled until a separately verified owner-controlled sender is approved. No customer-facing AI, paid tiers, inventory agent, or CVE monitoring is included.

Code is licensed under [MIT](LICENSE). Newly authored catalog metadata is dedicated under [CC0-1.0](catalog/LICENSE). Upstream descriptions, artwork, release notes and other third-party material retain their own terms. Owner approved these licenses on 2026-10-31.
