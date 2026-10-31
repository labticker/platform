# Future custom-domain migration

Deferred beyond MVP. Do not buy a domain, attach a custom Fly domain or alter DNS during current implementation.

After explicit owner authorization and domain ownership verification:

1. Record the current actual Fly origin, auth callbacks, webhook configuration and release SHA.
2. Bind the approved domain to Fly and verify HTTPS before changing canonical URLs.
3. Set `APP_URL` and `AUTH_URL` to the approved HTTPS origin; update canonical metadata, OAuth callbacks, allowed hosts, signed link creation and PostHog origin allowlists. Never derive trusted links from request Host.
4. Verify email sender DNS independently in Resend (SPF/DKIM and recommended DMARC); web TLS does not verify a sender. Keep auth tracking off and digest opens/clicks off unless separately reviewed.
5. Test existing unsubscribe links, token expiry, login redirects, consent, mock digests and signed webhooks. Preserve the previous origin/redirect compatibility for an agreed period.
6. Annotate analytics with migration date and verify historical continuity. Keep advertising disabled.

Rollback: restore prior canonical origin/callbacks and deployment configuration, retaining valid unsubscribe paths. Do not revert database changes or remove sender records without a separately reviewed plan.

