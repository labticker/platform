# GitHub OAuth pilot rollout

Owner approved GitHub OAuth with mock digests on 2026-10-31. This code does not activate it.
GITHUB_OAUTH_ENABLED must explicitly be true alongside AUTH_GITHUB_ID, AUTH_GITHUB_SECRET,
DATABASE_URL and a random AUTH_SECRET of at least 32 characters. APP_URL and AUTH_URL must match
the exact assigned HTTPS Fly origin. Credentials alone leave enrollment disabled.

Register an OAuth application in the labticker GitHub organization using the assigned app hostname:

- Homepage: https://labticker.fly.dev
- Callback: https://labticker.fly.dev/api/auth/callback/github
- Name: LabTicker pilot

Store secrets directly in protected GitHub environment/Fly secrets, never in chat or tracked files.
The provider requests user:email only, uses PKCE/state checks and requires a verified primary email
from GitHub's authenticated emails endpoint. Public profile email alone is insufficient. Stable GitHub
ID is retained for linking; email-based account linking is disabled. Access/refresh/ID tokens, scopes,
display names and avatars are not persisted. Original signup verification timestamps are preserved.

Before enabling: accepted Neon development migrations and restore path, approved production migration,
catalog synchronization, explicit privacy/retention disclosures, real PostHog project privacy settings,
safe MCP analytical acceptance and owner test of the entire OAuth callback/session flow are required.
Keep public email disabled and delivery mode mock. GitHub signup does not grant digest consent.
Do not describe mock acceptance as real delivery or expose mock inboxes on production hosts.

The catalog-only preview workflow remains independent and keeps enrollment disabled. Full launch
still needs the separate verified-sender and live email acceptance gates.

References: https://authjs.dev/guides/configuring-github and
https://docs.github.com/en/rest/users/emails#list-email-addresses-for-the-authenticated-user
