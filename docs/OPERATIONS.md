# Operations readiness runbook

This is a preparation checklist; deployment and restore have not been executed.

Before provisioning, confirm account authorization, quotas, regions and billing with the owner. GitHub organization creation and any paid resources require approval. Create only a public `platform` repo in the approved organization. Configure owner/backup maintainer, 2FA, private vulnerability reporting, secret scanning, protected main, required CI checks, and staging/production environments. Add actual team handles to CODEOWNERS once known; do not invent reviewers.

Connect official MCPs using the commands in `05_AI_MCP_OPERATIONS.md`. Owner completes initial OAuth/PAT authorization outside Git. Verify read-only identity/list calls in development: GitHub repository read, Fly existing-app inspection, Neon development branch schema, Resend test delivery state, and PostHog safe traffic aggregates. Record date/result without secrets. Neon MCP never accesses production subscriber SQL. Missing tool access is an unresolved gate, not a successful integration.

Deploy only through a reproducible pinned flyctl GitHub Actions workflow with protected environment approval. Fly MCP cannot create/deploy apps. After approved provisioning, record actual app slug and HTTPS origin, set APP_URL/AUTH_URL consistently, and deploy the same SHA to web and worker process groups. Keep worker private and initially one instance. Public fork checks get no secrets or privileged pull_request_target execution.

Before production migration: attach reviewed Drizzle SQL/schema diff, test on isolated dev/PR branch, verify backup/restore capability and compatibility with prior app image, obtain approval. Prefer additive migrations. Run smoke checks for web health, catalog provenance, recent worker progress, sanitized analytics and release-to-mock-digest. Record SHA, migration IDs, backup reference and outcomes.

Rollback: pause sends on uncertainty; redeploy the last compatible image through protected CI. Never automatically reverse destructive SQL. Restore backup to isolated staging first, validate counts/constraints and delivery dedupe, then follow an approved recovery plan. Preserve queued windows and reconcile ambiguous provider sends older than the provider idempotency window before retries.

On source failures retain history, show degradation and back off. On database outage halt new sends; resume durable leases after recovery. On quota exhaustion retain queue and alert. On bounce/complaint suppress immediately from verified webhooks. On duplicate delivery pause sends and reconcile digest keys/receipts. Keep logs free of addresses, secrets and raw webhook payloads.

Live email is separately blocked on verified owner-controlled sender, sender/contact identity, consent/unsubscribe, signed webhooks, quota review and authorized-recipient tests. Authentication sender must have tracking disabled. Opens remain off by default and, if later authorized, are unreliable estimates due to Apple MPP.

