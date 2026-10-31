# Release intake core

The GitHub adapter consumes published Releases API objects, excludes drafts/prereleases and uses conditional
polling with bounded pagination. Its declared policy is a recent-500 window, not exhaustive release history.
When that boundary is reached, historyLimited explicitly marks the result and the worker exposes a limited
source/application status. Existing release history is retained. Future cursor or deeper backfill support
must preserve stable identities and baseline semantics. GitLab/RSS support is still pending.

SafeHttpClient accepts exact configured HTTPS hosts. Every DNS answer must be public; a validated address
is pinned into native HTTPS while preserving hostname/certificate verification. Redirects repeat hostname
and DNS checks. DNS/redirect/body work shares an absolute deadline; identity encoding and byte limits
bound responses. Trusted application/test code can inject dependencies; catalog JSON cannot inject code.
The worker persists cache/health and applies exponential retry delays from five minutes to six hours.

Version schemes require reviewed configuration. Unknown/calendar schemes do not produce semantic major
warnings, and year-like major values remain conservatively excluded. Evidence is bounded plain text and
advisory only; renderers still escape it. No compatibility, vulnerability or exhaustive detection claim exists.

Prepared batches derive application-scoped stable keys and mark initial history as backfill. Database conflicts
preserve original firstSeenAt/backfill. Delivery eligibility, durable reservations and accepted receipts belong
to the worker/database queue. This package never records a receipt or sends email.

Tests use fixtures/injected transport and DNS without internet. Prior read-only Linkding smoke separately
verified one live upstream request; it is not sustained polling or cloud acceptance. Multi-process Neon,
restart/load tests and broader provider support remain outstanding.

Primary references: https://docs.github.com/en/rest/releases/releases#list-releases ;
https://nodejs.org/api/https.html ; https://nodejs.org/api/dns.html ; https://github.com/npm/node-semver.
