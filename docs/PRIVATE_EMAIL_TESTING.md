# Private real-email testing

This is a separate owner-only delivery path. Scheduled digests remain mock, public registration stays closed, email authentication stays disabled, and ads/sponsors/open/click tracking remain off. The product sends through the Resend SDK; an operational MCP send is not accepted as application delivery proof.

## Owner/account prerequisites

The owner chooses a DNS-verified sending domain, exact sender, approved recipient list (maximum five), reply-to address and sender identity/contact. No fly.dev sender or new domain/DNS purchase is permitted. Confirm sending is verified and all domain tracking is off. The application sends only to the signed-in admin's verified account email when it exactly matches the approved list; there is no recipient override field.

Store RESEND_API_KEY as a production Environment secret in GitHub, with Sending access restricted to the chosen domain. Store RESEND_WEBHOOK_SECRET from the application's registered webhook there as well. Do not paste either credential into chat, tracked files, logs or issues. The webhook endpoint is the assigned app origin plus /api/webhooks/resend, subscribing to email.sent, email.delivered, email.delivery_delayed, email.bounced and email.complained. No open/click subscription is required.

An administrative reply inbox may use Resend forwarding mode within included capacity. Creating it does not set up mail routing: the existing mail provider must forward the chosen admin alias to the receiving address supplied by Resend. Do not replace existing domain MX records or claim the reply route works until an actual reply reaches that inbox. Private addresses and forwarding targets belong in account configuration, not this repository.

EMAIL_TEST_APPROVAL_JSON is a protected secret using this contract (illustrative values only):

```json
{
  "ownerApproval": {"decision":"private-email-test-approved","reference":"owner-private-test-decision"},
  "appUrl":"https://actual-assigned-app.fly.dev",
  "sender":{"address":"labticker@example.com","domain":"example.com","status":"verified","evidenceReference":"verified-sender-check","checkedAt":"2026-11-02T00:00:00Z"},
  "trackingReview":{"reference":"tracking-off-check","authOpenTracking":false,"authClickTracking":false,"digestOpenTracking":false,"digestClickTracking":false},
  "recipients":["owner@example.com"],
  "replyTo":"admin@example.com",
  "senderIdentity":"LabTicker",
  "senderContact":"Contact LabTicker Admin"
}
```

The private decision cannot activate the general digest/auth transport. Provider keys alone do not enable testing.

## Rollout and one-message test

Merge after required CI under standing authorization. Dispatch deploy.yml with owner-acceptance, email_delivery_mode=mock, email_auth_enabled=false, analytics_enabled=false and email_test_enabled=true. The configuration step refuses missing/invalid sender evidence, SDK credentials or signed-webhook configuration. Reviewed migration 0009 adds an isolated test queue; startup does not migrate automatically. Fresh verified backup, scoped grants and existing one-web/one-worker limits still apply.

At /digests, sign in as the owner and select applications with stored release history. Check the separate one-message consent and press Send a test digest to my verified account email. A frozen request UUID deduplicates retries/double submissions. A bounded post-response SDK attempt sends promptly; the single background worker retries durable pending work with the same payload/key after restart or transient failure. No faster persistent Neon polling is introduced.

The message has a [TEST] subject, explicit historical-sample notice, sender/contact identity, visible unsubscribe and RFC8058 headers. Historical releases are never recorded as normally delivered. Test acceptance/delivery/bounce/complaint history appears only in the owner's session. Provider acceptance is not inbox delivery. Verify the actual recipient's inbox, then reply to check the administrative route.

## Safety and evidence

Enqueue requires owner-only/admin mode, verified allowlisted account, separate consent, active account and no suppression. Rate limits serialize globally: three per hour and ten per day per owner, twenty-five per day globally. Pending messages have durable fenced leases, maximum five attempts and a retry window shorter than the provider idempotency period. Identity/payload are immutable in PostgreSQL. Every attempt rechecks account and recipient eligibility.

Signed webhooks update a separate ledger. Opens/clicks remain ignored, and test messages never create ordinary digest receipts or PMF engagement. Bounce/complaint suppresses further sending and is recorded as a test-specific event. Account deletion removes its test messages; sent/skipped test records expire after thirty days. Pending/failed/ambiguous records remain for reconciliation.

Tests cover policy bypass, unauthorized recipients, separate consent, quotas, idempotency, frozen payloads, retries, suppression, privacy projections, webhook replay/delivery and role permissions. Fake SDK acknowledgements and synthetic webhook signatures prove local logic only. Do not claim live inbox, webhook or reply-route acceptance until those actual external checks pass.
