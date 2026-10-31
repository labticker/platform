# Release intake core

The GitHub adapter consumes documented published Releases API objects, excludes drafts and prereleases, supports conditional polling, and bounds pagination. An incomplete history fetch fails rather than silently reporting complete coverage. GitLab/RSS adapters remain pending; the catalog source contract is not a claim that every provider is implemented.

`SafeHttpClient` only accepts configured exact HTTPS hostnames. Every DNS answer must be public; a validated address is pinned into a fresh native HTTPS connection while retaining normal hostname/certificate validation. Redirects repeat hostname/DNS checks. DNS, redirects and body streaming share an absolute deadline; identity encoding and byte limits prevent compression/size surprises. Dependencies can be injected by trusted application/test code, never by catalog JSON. Source authorization, cadence/backoff and cross-source concurrency belong to the worker.

Version schemes are explicit, reviewed configuration: unknown and calendar versions never generate semantic major warnings. Year-like semantic majors are conservatively excluded. Annotation evidence is bounded plain text and advisory only; renderers must still escape all text. No compatibility, vulnerability or exhaustive detection claim is made.

Prepared release batches derive stable application-scoped keys and mark initial history as backfill. Database upserts must preserve the first observation time and original backfill marker on conflicts, never replacing them with a later scan. Delivery receipts and consent/subscription eligibility are separate database concerns. No delivery receipt is created by this package.

Tests use fixtures and injected transport/DNS, without internet calls. Live polling, retry/backoff/source-health persistence, GitLab/RSS, database integration and worker restart acceptance remain outstanding.

Primary contracts consulted: [GitHub releases API](https://docs.github.com/en/rest/releases/releases#list-releases), [Node HTTPS](https://nodejs.org/api/https.html), [Node DNS](https://nodejs.org/api/dns.html), [node-semver](https://github.com/npm/node-semver).
