# Local vendor tooling setup

Installed 2026-10-30 on the owner workstation, outside the repository:

- Fly CLI 0.5.1 in the user .fly/bin directory (added to user PATH).
- Neon CLI 8.15.1 and Resend CLI 2.26.2 installed globally through npm.
- GitHub CLI already installed and authenticated.
- Codex global MCP registrations: github, fly-mcp, neon, resend, posthog.

Version commands passed. MCP registration is not an authenticated vendor test. No resources provisioned, permissions granted, messages sent, or paid services activated.

## Owner authorization

Open a fresh PowerShell window so PATH changes are loaded. Run OAuth logins one at a time:

```powershell
codex mcp login fly-mcp
codex mcp login neon
codex mcp login resend
codex mcp login posthog
flyctl auth login
neon auth --keyring
resend login
```

Review requested grants before approving. Default discovery requested broad Fly administration, Neon read/write and Resend full-access/send scopes. Use development/test-only accounts or projects; do not authorize production subscriber data. Do not assume the documented read-only agent posture technically restricts these grants. Narrow scopes where supported before authorization.

PostHog login failed during metadata discovery with a connection error in this session. Registration exists but OAuth and queries remain unverified. Retry and diagnose transport before assuming credentials are the cause.

GitHub MCP reads GITHUB_PAT_TOKEN from the environment. Set a fine-grained token through the local OS environment UI outside Git, scoped to the approved public repository and only necessary permissions; restart Codex afterward. Do not paste tokens into chat, commands, tracked files or screenshots. Existing gh authentication remains a CLI fallback; it was not copied or exported into MCP configuration.

Resend CLI login prompts locally for the API key. Production runtime SDK credentials and protected Actions deploy/migration secrets are separate from MCP OAuth. No live sending until verified sender, consent and owner authorization gates are met.

After authorization restart the Codex session to load registered tools. Verify read-only identity/list calls, dev-only Neon project access, Resend test diagnostics and aggregate-only PostHog queries; record redacted outcomes. Keep production Neon MCP access forbidden. CLI installation does not authorize billable resource creation.

Official sources: https://developers.openai.com/codex/mcp ; https://fly.io/docs/flyctl/install/ ; https://neon.com/blog/just-landed-in-the-neon-cli ; https://github.com/resend/resend-cli
