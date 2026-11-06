# Pilot rollout

## Owner scheduled-email pilot

The owner authorized this stage on 2026-11-06 after a real SDK test, recipient formatting confirmation and successful signed delivery-event reconciliation. This permits consented daily/weekly release digests to the single already approved owner address. It does not authorize public enrollment, campaigns, tracking, paid services or advertising.

Dispatch deploy.yml from trusted main with rollout_stage=owner-email-pilot, email_delivery_mode=resend, email_auth_enabled=false, email_test_enabled=false, analytics_enabled=false and live_email_approval_reference=owner-scheduled-email-approved/pilot-2026-11-06. Keep the existing one-web/one-worker capacity, fresh verified backup and migration/role/smoke checks. Existing protected test policy supplies reviewed sender, contact, reply-to and recipient evidence; the separate explicit deployment decision creates an owner-scoped scheduled-email policy. Credentials or a test policy alone never activate scheduled delivery.

Runtime keeps OWNER_ACCEPTANCE_ONLY=true and PUBLIC_EMAIL_ENABLED=false. The private transport carries a nonserializable, origin/gateway-bound singleton recipient capability. Preparation and claiming filter by that scope and admin role before their limits; dispatch rechecks current eligibility, account role/email, consent, suppression and frozen payload. The SDK gateway independently rejects other recipients. No schedule or consent is silently enabled. Existing daily/weekly timezone preferences and new unseen releases determine delivery; empty digests are skipped. Historical baseline releases and private samples do not create normal delivery receipts. Mock and real receipts remain separate, and later public rollout retains real owner receipts.

The sample-test checkbox is disabled in this stage; normal history displays real accepted/delivered statuses. Provider opens/click tracking stays off. Check saved preferences at /settings and upcoming delivery at /dashboard; new eligible releases are sent only at the due schedule. Worker ticks every fifteen minutes, so due sends can lag that interval plus bounded work. Verify the first scheduled provider delivery/webhook and unsubscribe before wider enrollment. A reply must actually reach the administrative inbox before claiming forwarding acceptance.

Rollback: dispatch the same trusted workflow with owner-acceptance, email_delivery_mode=mock and email_test_enabled=false. This stops real scheduling without changing selections, consent, history or real receipts. Pending real payloads remain reserved for reconciliation; never edit or resend them with a new key after ambiguous acceptance. Fresh backup and normal smoke checks still apply.

## PostHog account prerequisites for public enrollment

Create a free project, consciously select its processing region and keep the spend ceiling at $0. In project Web analytics settings, enable cookieless tracking. Disable person profiles, replay, autocapture and unused products; review processor retention and access. Do not paste credentials into chat. No billing upgrade is authorized.

Store the following GitHub production Environment variables:

- NEXT_PUBLIC_POSTHOG_KEY: project token (public ingestion token, not a personal API key).
- NEXT_PUBLIC_POSTHOG_HOST: https://us.i.posthog.com or https://eu.i.posthog.com.
- POSTHOG_PROJECT_ID: numeric project ID.
- POSTHOG_MEASUREMENT_START_DATE: actual first measurement date, YYYY-MM-DD.

Store a least-privilege project-restricted read-only query key as the production Environment secret POSTHOG_QUERY_API_KEY. Restrict access to this project; the worker uses fixed aggregate queries, never arbitrary owner-provided SQL. Connect the official hosted PostHog MCP using OAuth and read-only permissions. If workstation DNS policy blocks the official endpoint, the owner must explicitly allow it through the existing filter; do not bypass filtering.

Before rollout, prove actual cookieless ingestion, no analytics cookies/storage/profiles/PII or replay, Do Not Track/opt-out handling, correct retention and $0 limit, and a safe aggregate MCP query. Validate privacy disclosures and the first-party PMF dashboard, delivery/complaint/unsubscribe metrics and aggregate-only AI access. Public rollout remains blocked until this acceptance passes; a key's presence is not acceptance evidence. Public real email requires its own separately reviewed sender approval document, not the private owner policy. GitHub OAuth can remain the pilot sign-in method; magic-link email is separately gated.

Official references checked 2026-11-06: [cookieless setup](https://posthog.com/tutorials/cookieless-tracking), [billing limits](https://posthog.com/docs/billing/limits-alerts), [official MCP setup](https://posthog.com/docs/model-context-protocol/codex).
