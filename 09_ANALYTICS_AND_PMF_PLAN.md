# LabTicker Privacy-Preserving Product Analytics & AI Reporting — MVP Specification

**Status:** Required at MVP launch, not a later enhancement. **Version:** v0.5 / 2026-10-30.  
**Decision:** PostHog cookieless site/product measurement + first-party Neon operational metrics + Resend event webhooks + read-only analytics access for Codex. Advertising remains OFF until explicit product-market-fit (PMF) review and owner authorization.

## 1. Platform decision

**Recommended provider: PostHog Cloud, free tier** (first 1,000,000 analytics events/month as published October 2026). It offers an *official hosted Codex-compatible MCP* to query analytics, build insights, read funnels, and examine acquisition trends. Configure **cookieless mode always**, `person_profiles: 'never'`, `autocapture: false`, no identity linking (`identify()` or `alias()`), no session replay, no heatmaps, no recordings, no full URL query strings, and no personally identifiable data. Record only a small set of intentionally named events and pageviews. Set a strict spend limit of $0 and investigate quotas and data retention.

**Alternative: Umami.** Stronger privacy-by-default posture, open source, official read-only MCP. Umami Cloud Hobby ($0, 100K events) does **not** include API/MCP access; Cloud Pro ($20/month) does. Self-hosted Umami v3.4+ supports its read-only MCP (enable `MCP_ENABLED=1`) but adds a database/server to maintain. Choose Umami if fully self-hosted analytics is a higher priority than zero-extra-cost MCP. Do not install two trackers by default.

**Privacy tradeoff:** Even cookieless traffic analytics can send technical request information to the analytics provider; document the processor/region/retention and verify all applicable legal requirements. Avoid declaring the whole stack 'anonymous' or automatically compliant. User authentication and operational tables in Neon remain personal data and need their own access controls.

## 2. Instrumentation boundaries

- `apps/web`: client-only analytics adapter `packages/analytics` with `noop` and `posthog` implementations; feature-gated by `ANALYTICS_PROVIDER=posthog` and public PostHog project token and host. No secret analytics key in the browser. No tracker in local development or automated tests.
- Pages: send `$pageview` with **pathname only** (discard query strings/tokens, referrer paths containing PII, and authenticated URLs that leak email or IDs). Public marketing and catalog pages count toward acquisition. Product pageviews may be counted without identity linking.
- Named, deliberately coarse browser events, no typed search strings or email addresses: `catalog_search_used`, `catalog_filter_used`, `monitor_toggle_clicked`, `signup_started`, `digest_preference_opened`, `release_notes_link_clicked` (optional). Avoid high-cardinality properties; use route template, broad category, digest frequency, high-level release flags only.
- **Authoritative operational events** originate server-side in Neon, *not* solely the browser: signup completed, digest opt-in confirmed, first monitor selected, three or more monitors active, preference changed, message accepted/delivered, bounced, complained, unsubscribe, feed health. Bot/script activity can distort client events.
- Do not send email, account IDs, API keys, magic links, user-agent fingerprints, raw IPs, exact external URLs, IP-based geolocation, or individual subscriber histories to PostHog. Disable third-party analytics when `Do Not Track` or explicit app privacy preferences require it (document policy).
- No cross-device/cross-session user identity stitching in PostHog. **Therefore PostHog user-level retention/funnels may be incomplete**; determine verified-user activation and day-30 retention using first-party aggregate SQL in Neon. Never portray cookie-free web unique visitors as exact natural persons.
- Provide a `/privacy` explanation and account settings for analytics preferences where applicable. Ensure any required consent is obtained before activating tracking.

### Indicative SDK configuration (verify against pinned current PostHog SDK docs)

```ts
posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
  api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST!,
  cookieless_mode: 'always',
  person_profiles: 'never',
  autocapture: false,
  capture_pageview: false,  // explicit sanitized pageview events instead
  disable_session_recording: true,
});
```

Enable the account's cookieless setting in the PostHog project UI; configure production region consciously. Disable unused SDK functions; smoke-test with browser network inspector that no cookies/localStorage entries are written, no PII URLs leak, and no replay uploads occur. See https://posthog.com/tutorials/cookieless-tracking .

## 3. Business/event dictionary (source of truth)

| Signal / event | Collection | Allowed dimensions | Purpose |
|---|---|---|---|
| `public_pageview` | PostHog | pathname template, safe referrer category, UTM source/medium (sanitize) | Traffic and sources |
| `catalog_search_used`, `catalog_filter_used` | PostHog | filter category, result-count bucket | Catalog engagement |
| `signup_started` | PostHog | entry surface | Landing-page interest |
| `user_registered` | Neon | UTC date only in aggregate reports | Verified signup conversion |
| `digest_consent_confirmed` | Neon | date, consent version | Permission and activation |
| `monitor_added` / `monitor_removed` | Neon authoritative; optional PostHog anonymous UI event | broad app category only when emitted outside Neon | First value received |
| `three_monitors_active` | Neon computed, one activation per user | cohort week | Activation rate |
| `digest_preference_changed` | Neon | daily/weekly, timezone group only when necessary | Personalization |
| `digest_queued` / `digest_sent` | Neon | cadence, batch date | Scheduling reliability |
| `email.delivered` | Resend signed webhook -> Neon | digest ID internally; date/cadence in aggregate views | Delivery denominator |
| `email.opened` | Resend -> Neon, **opt-in/tracking-gated and estimate only** | daily aggregate only exposed to AI | Approximate reported opens |
| `email.clicked` | Resend -> Neon, **tracking-gated** | link class (release notes/settings) | Actionable engagement |
| `email.bounced` / `email.complained` | Resend -> Neon | counts and rates | Hygiene and sender health |
| `unsubscribe_completed` | Neon | date/cohort | Churn and consent |
| `day_7_active` / `day_30_active` | Neon aggregate | signup cohort, no identities in AI reports | Product-market fit |

**Define retention precisely:** for MVP, 'active at day 30' means consented user who still has >=1 enabled monitor and is not suppressed/unsubscribed at 30 days after signup; additionally report 'engaged at day 30' separately (has clicked a release-note link or logged into dashboard within days 23–37), measured only where available and disclosed. Never equate continuing subscription with an actual email open.

## 4. Email telemetry (Resend)

Resend provides `email.sent`, `email.delivered`, `email.opened`, `email.clicked`, `email.bounced`, `email.complained`, `email.delivery_delayed`, and related webhooks, plus an Email Metrics API. `email.opened` and `email.clicked` require respective **domain-level tracking settings**. Open tracking inserts a unique 1×1 tracking pixel; click tracking rewrites links through a redirect. **These techniques are not equivalent to privacy-preserving cookieless web analytics.**

**MVP decision:** implement full optional Resend webhook ingestion, normalized event tables and dashboard counts now. Delivery/bounce/complaint tracking should run from launch. For click and open metrics, use a clearly disclosed and separately reviewed digest-sending domain configuration; keep **open tracking OFF by default** until a transparent subscriber notice/privacy review and explicit owner activation. If enabled, label it "reported opens (estimated)". Respect a recipient opt-out by using a non-tracked digest-sending domain or disable open tracking globally; Resend's toggle is **domain-level**, not per-recipient. Never enable tracking on magic-link/authentication email domain. Do not promise a user-specific opt-out without an implemented sending-domain strategy. Click tracking may be enabled only after disclosure and privacy review; if not enabled use aggregate release-note page visit counts as a weaker engagement proxy.

- `POST /api/webhooks/resend`: validate raw body and `svix-id`, `svix-timestamp`, `svix-signature` using official Resend SDK verifier and webhook secret; dedupe on provider event ID; process idempotently; avoid writing raw payloads indefinitely.
- Correlate `resend_email_id` with internal `digest_delivery` in Neon. In tables, restrict message IDs and user relationships to authorized server-side code only, never expose through PostHog or AI.
- On hard bounce/complaint, suppress future sends and update subscription state. On unsubscribe, record preference and route through suppression rules.
- Record `first_opened_at` / `first_clicked_at` at most once for distinct-per-message metrics (do not treat repeated pixel loads as more recipients). Aggregate daily totals; delete raw detailed telemetry according to retention policy.
- Report delivered denominator, unique *messages* with click, bounced, complained, and unsubscribed; distinguish delivery failures from engagement.
- Open rate denominator: delivered messages in the tracked subset only. Mark as **unreliable** due to Apple Mail Privacy Protection, proxies, blocked images and security scanners. Apple MPP may prefetch content, inflating opens.
- Click data can also be inflated by automated security scanners. Use first-party `/release/[id]` site landings as a corroborating engagement signal; do not auto-add new personal identifiers.

## 5. Database extensions (Drizzle migrations)

Preserve the existing `users`, `subscriptions`, `digest_deliveries` tables and add or extend:

```text
resend_webhook_events
  id (UUID PK), provider_event_id (unique), event_type,
  resend_email_id, received_at, processed_at, processing_status
  [short retention; no raw PII payload in long-term storage]

digest_message_engagement
  digest_delivery_id (unique FK), delivered_at, first_opened_at nullable,
  first_clicked_at nullable, bounced_at, complaint_at,
  tracked_open_enabled boolean, tracked_click_enabled boolean
  [restricted; delete/anonymize on deletion policy]

analytics_daily_aggregates
  metric_date (UTC), metric_name, dimension_key (safe allowlisted low cardinality),
  metric_value integer, computed_at; unique(metric_date, metric_name, dimension_key)
  [no email, user IDs or raw URLs; source for read-only AI]

analytics_report_runs
  report_id, from_date, to_date, status, source_watermark,
  completed_at, error_summary
```

Materialize reports from source tables in the worker daily; recompute recent 7–14 days for delayed Resend events; UTC for reporting, user timezone solely for digest scheduling. Use transactions and unique constraints. Avoid materializing counts by every individual app or external link if this creates tiny cohorts; apply a minimum cell threshold (e.g., 10) for AI-visible breakdowns.

## 6. Read-only AI access & MCP

**PostHog official MCP (primary):** Codex connects via `codex mcp add posthog --url https://mcp.posthog.com/mcp` and logs in with OAuth. It may inspect web traffic, channels, page performance, events, funnels and dashboards. **Default agent posture: read-only**; do not give broad access to feature-flag mutations or analytics project changes without approval. PostHog MCP has more than read actions; scope permissions accordingly.

**Neon production data:** never grant Codex Neon production query/mutation access through Neon MCP. Instead expose **first-party aggregate-only analytics** through either (a) a protected read-only internal `/api/admin/analytics/summary?from=...&to=...` endpoint with strict admin permissions, no personal data, pagination and rate limits, and/or (b) a small *read-only* MCP server built inside the app backed ONLY by the precomputed `analytics_daily_aggregates` table (no arbitrary SQL, no unrestricted Neon connection). Authenticate service-to-service, audit access, and provide safe query templates.

**Resend official MCP:** available for operations and metrics diagnostics, but production metrics and recipient identifiers may be sensitive. Provide the AI a redacted aggregate summary via the internal endpoint as the preferred source. Restrict production Resend MCP access; no contact exports or bulk sends for analytics agents.

**Suggested AI questions:** "Compare unique visitors and signup conversion week over week"; "What percentage of verified accounts activated three monitors within 7 days?"; "Which cadence retains users better at day 30?"; "Show delivery, bounce, complaint, and click-through trends, with open rates marked unreliable"; "Which catalog categories receive the most monitoring selections?"; "Did a recent release increase site visits but not monitor activations?"

**AI access is analytical, not autonomous governance:** An agent may open an issue or PR with metric-backed recommendations. It may not auto-change pricing, enable ads, alter privacy preferences, send campaigns, or modify production data without owner approval. All reported conclusions should show date ranges, definitions, denominators and uncertainty.

## 7. Core PMF dashboard (owner/admin)

Display rolling 7/30 days and prior-period comparison:

1. Visitors, pageviews, traffic source categories (PostHog; estimates, blocked by some browser privacy features).
2. Verified signups, conversion = verified signups ÷ attributed eligible landing visits (only a directional estimate without identity stitching).
3. Activation = newly signed-up users who add >=3 monitors within 7 days ÷ verified signups in the matured cohort.
4. Retention = active monitored subscribers at day 30 ÷ signups whose 30-day window has elapsed. Engaged retention tracked separately.
5. Digest coverage = due digests sent / due digests; timely send rate; source freshness and failure counts.
6. Delivery rate, bounce rate, complaint rate, unsubscribe rate (well-defined denominators and cohorts).
7. Click-through rate = delivered messages with verified or reported release-note click ÷ delivered tracked messages; marked biased by scanners/tracking opt-outs.
8. **Reported open rate (optional, estimated only)** = delivered tracked messages with >=1 open webhook / delivered tracked messages. Show warning about Apple MPP; do not use as core PMF gate.
9. Top monitored *categories*; app-level trends for internal ops only, respecting aggregation and threshold policy.

**Threshold hypotheses for review:** 100 beta signups; >=60% activate >=3 monitors within seven days; >=50% retain >=1 enabled monitor at day 30; qualitative feedback confirming digests save time; stable deliverability, no duplicate digests. These are decision prompts, not guaranteed benchmarks. Owner decides PMF separately; do not auto-enable monetization based on a number.

## 8. Development acceptance criteria

- [ ] Site traffic recorded in PostHog cookieless mode in production; zero cookies/local storage and zero replay traffic created by analytics SDK.
- [ ] PII/magic-link URL suppression verified with tests; no `identify()` or persistent cross-session IDs.
- [ ] Test analytics adapter works with provider disabled and website fully functional.
- [ ] Anonymous client events correlate directionally with authoritative server totals, with discrepancies documented.
- [ ] Signed Resend webhook accepted; invalid signatures rejected; duplicate replay cannot double-count.
- [ ] Delivered, bounced, complained, unsubscribed events reflected in daily aggregates and admin dashboard.
- [ ] Open/click event handling tested via fixtures with tracking toggle OFF; only configured production digest domain enables them after policy review.
- [ ] Open rate labelled **estimated / untrustworthy**; neither Apple proxy opens nor link scanners automatically imply a human clicked/read.
- [ ] AI only sees aggregates via internal report interface; requests for raw users/emails or arbitrary SQL are rejected and logged.
- [ ] `codex mcp add posthog --url https://mcp.posthog.com/mcp` documented and read-only analytics query tested.
- [ ] Fewer than 10 observations in a category/date slice are suppressed from AI-accessible detailed breakdowns.
- [ ] Rate limits, retention/deletion settings, monthly free quota and $0 spend ceiling configured.
- [ ] Analytics and ad functionality remain **independent**; launching analytics does NOT activate ads.

## 9. Pricing and verified documentation (2026-10-30)

- PostHog: 1M events/month free, hosted MCP, cookieless mode: https://posthog.com/pricing ; https://posthog.com/docs/model-context-protocol/codex ; https://posthog.com/tutorials/cookieless-tracking
- Umami: cloud free 100K events/month; cloud Pro $20/month with API and MCP; self-host v3.4+ official read-only MCP: https://umami.is/pricing ; https://umami.is/blog/umami-v3.4 ; https://github.com/umami-software/umami/blob/master/packages/mcp/README.md
- Resend: tracking is domain-level, disabled by default; open pixel/click redirects; webhooks and Email Metrics API: https://resend.com/blog/introducing-custom-tracking-domain ; https://resend.com/features/webhooks ; https://resend.com/changelog/email-metrics-api
- Apple Mail Privacy Protection: https://support.apple.com/en-ca/guide/iphone/iphf084865c7/ios

**Final decision:** Launch with measurement ON, advertising OFF. Emphasize acquisition, verified activation and retention rather than open rates. AI gets safe analytics access; never unrestricted subscriber records.


## LabTicker domain measurement note

Analytics starts with the **actual** Fly `https://<assigned-app>.fly.dev` origin. Configure allowed origins and attribution for that hostname, not an unpurchased domain. If a domain is purchased later, preserve historical event continuity, annotate the date of the origin change, and update link tracking and first-party privacy disclosures. Do not use ad network trackers; ads remain disabled until PMF and owner authorization.
