# Local account runtime

Public authentication remains unavailable. Auth.js uses database sessions and a custom email provider that writes short-lived fictional-account links only to the local process memory; it never sends an email or logs links.

To exercise against a reviewed, migrated development PostgreSQL database, configure outside Git:

- NODE_ENV=development (use pnpm --filter @labticker/web dev)
- AUTH_TEST_MODE=true
- APP_URL=http://localhost:3000 and AUTH_URL with the identical origin
- AUTH_SECRET: at least 32 random characters
- DATABASE_URL: development/test database only
- UNSUBSCRIBE_SECRET: at least 32 random bytes
- EMAIL_DELIVERY_MODE=mock and PUBLIC_EMAIL_ENABLED=false

Visit /auth/sign-in, request a link for tester@example.com, open /auth/mock-inbox, and follow the local link. Use /dashboard to select monitors and /settings for separate digest consent, cadence and timezone. The catalog must first be imported with release-source records. Nothing in this flow provisions a database or activates public email. Never expose the development server to an untrusted network; every local test link is intentionally accessible to the local test operator.

The mock inbox is bounded, in memory, and disappears on restart. This is not a public authentication transport. Production always disables it, even if AUTH_TEST_MODE is accidentally set. Real Resend email-auth integration requires a separately reviewed verified-sender deployment; no alternate OAuth provider is activated here.

Account mutations require authenticated database-backed sessions, verification and same-origin server actions. Suppression cannot be cleared by saving settings. Unsubscribe accepts a signed purpose-specific token independently of login; GET only confirms and POST suppresses immediately and withdraws consent. Deletion removes profile/contact/auth/session/monitor data and saved digest payloads while retaining pseudonymous delivery/compliance/history rows subject to a reviewed retention policy.

The Webpack extension alias resolves NodeNext package source imports ending in .js to their TypeScript workspace sources. Both development and production builds use the same resolver. No database connection is opened at import/build time.

Executed evidence: account repository tests use migrated isolated PGlite and cover monitor authorization, unmonitorable sources, idempotent toggles, consent, persistent suppression, deletion and analytics history; a separate pure policy test rejects production/foreign-origin/weak-secret test auth. A live browser magic-link round trip against PostgreSQL has not yet run.
