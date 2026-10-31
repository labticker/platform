# Dormant Resend digest boundary

The runtime still selects the mock gateway. Importing `@labticker/notifications/resend` never reads
credentials, selects a provider, verifies DNS, activates tracking or sends messages.

Explicit construction requires mode=resend, public sending enabled, a recorded owner live-email decision,
a verified-domain evidence reference and timestamp, an exact sender mailbox/domain, a distinct reviewed
authentication domain, and a tracking-review reference affirming tracking is OFF for both domains.
Fly-controlled fly.dev domains and local/reserved domains cannot be senders. Configuration is reviewed
deployment input; its existence is not proof that verification or authorization actually occurred.

The SDK adapter sends one recipient, HTML/plain text, unsubscribe headers, and the stable idempotency key.
It rejects envelope/header injection, extra headers, tracking image/script/iframe markup, and unsubscribe
URLs outside the configured HTTPS app origin. Consent, suppression, queued payload immutability, quotas,
lease fencing and the last pre-send eligibility check belong to the durable queue.

Each SDK request receives a native AbortSignal timeout (10 seconds by default, configured between
100 milliseconds and 30 seconds). Injected SDK clients must honor that signal. Timeout/abort is unknown
acceptance, not proof of rejection: retry only the unchanged payload/key within the safety window.

Provider failures become `EmailDeliveryError` with disposition=retryable, permanent, or ambiguous.
429/concurrent idempotency responses may retry; other 4xx responses are permanent; network/5xx/invalid
acknowledgements are ambiguous. No original provider text, cause, recipient, body or response is exposed
by these normalized errors. The queue must reuse exact content/key and quarantine uncertain sends after
the provider's 24-hour idempotency window instead of blindly resending.

Tests inject the SDK boundary and make no network calls. No sender domain has been verified by this module,
no owner approval is implied by fixture values, and no real send, webhook registration or public rollout ran.
The separate authentication-message webhook correlation/retention/reconciliation gates remain open.

Official API contracts checked: https://resend.com/docs/api-reference/emails/send-email ;
https://resend.com/docs/dashboard/emails/idempotency-keys ; https://resend.com/docs/api-reference/errors
