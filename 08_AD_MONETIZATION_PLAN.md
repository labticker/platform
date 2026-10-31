# LabTicker Dormant Advertising Architecture — Post-PMF Monetization Extension

**Analytics exception:** PostHog cookieless product analytics and first-party Resend/Neon email telemetry **must launch with the MVP**, even though ads remain entirely disabled. See `09_ANALYTICS_AND_PMF_PLAN.md`. Product measurement does not imply permission to activate sponsored content or third-party ad networks.

**Status:** Implementation-ready product decision, 2026-10-30  
**Scope:** Free, ad-free SaaS launch. Build and test the capability for future website ads and first-party email sponsors, but **never activate them during MVP/beta**. Monetization begins only after a deliberate product-market-fit review and owner approval.  
**Key architectural rule:** Email advertisements and browser advertisements are *different products*. Do not attempt to render a website ad tag in HTML email.

## 1. Provider research and decisions

| Network/channel | Website | Personalized Resend emails | Access barrier / decision |
|---|---|---|---|
| Google AdSense | Yes, after publisher/site approval and policy compliance | **NO.** Google explicitly forbids AdSense ad units in emails | **Prepare optional website integration**, disabled by default until approval |
| Carbon Ads | Yes, on approved sites only | Not a documented supported email-ad product | **Future website alternative.** Applications start around 10,000 monthly pageviews; exclusive site placement, no simultaneous AdSense/backfill |
| EthicalAds | Yes, with publisher approval | No documented email placement | **Future website alternative.** Generally 50,000 monthly pageviews minimum |
| beehiiv Ad Network | Not relevant to app | Only for newsletters actually sent through beehiiv | **Do not integrate** while retaining Resend as sender; paid beehiiv plan, distribution incompatibility |
| First-party affiliate / direct sponsorship | Yes, as approved editorially labeled placement | **Yes**, as fixed HTML + plain-text sponsored/affiliate section (following program rules) | **MVP email monetization option**, but no automatic revenue or guaranteed affiliate approval |

**Critical facts:**

- Google says publishers **may not** put AdSense ads in emails. https://support.google.com/adsense/answer/1348735
- Google requires original useful site content; a thin or near-duplicated index of upstream metadata might not be approved. Treat acceptance as an external gate, not a feature Codex can guarantee. https://support.google.com/adsense/answer/7299563
- Carbon currently starts its application process at 10,000 monthly pageviews, says typical CPM ~$1.50–$2.30, and is site-exclusive (cannot use AdSense or other ad networks on the same site when contracted). https://www.carbonads.net/join and https://www.carbonads.net/faq
- EthicalAds generally seeks 50,000 monthly pageviews: https://www.ethicalads.io/publishers/faq/
- beehiiv says its Ad Network cannot be used when newsletters are sent with a third-party ESP. https://www.beehiiv.com/support/article/17507491038231-ad-network-faq
- Resend requires explicit opt-in and identifying/unsubscribe information for bulk mail. https://resend.com/legal/acceptable-use
- Canadian CASL requires consent, sender identification, a mailing/contact address and compliant unsubscribe for commercial email. https://ised-isde.canada.ca/site/canada-anti-spam-legislation/en/getting-consent-send-email

## 2. MVP business decision

1. Keep the SaaS free and **completely ad-free through initial launch and public beta**. Monetization is not an MVP success criterion.
2. Implement stable provider interfaces and test fixtures, but set `ADS_ENABLED=false`, `EMAIL_SPONSORS_ENABLED=false`, and `WEB_AD_PROVIDER=none` across environments by default. Production must deny ad rendering even if a vendor ID or campaign is configured accidentally.
3. Make web advertising provider-swappable, initially **only the `none` implementation**; evaluate AdSense as a future adapter. Carbon is a later *alternative* provider, not backfill.
4. Implement a **dormant** first-party email sponsor slot and optionally draft-only campaign management. The composer must include zero sponsored/affiliate content in every MVP/beta email, regardless of draft campaigns. Never send mock sponsors to real subscribers.
5. A digest must always provide useful software updates. Never send an otherwise empty digest solely to monetize the inbox.
6. No programmatic ad targeting based on the user's monitored software list; do not share subscriber data, installed services, email addresses or segments with advertisers. Site advertising has separate visitor privacy disclosure/consent requirements.

## 3. Website ads: no-op MVP interface; AdSense only after PMF

### Placement policy

- Build a `<WebsiteAdSlot placement="public-app-detail" />` component on eligible public application pages backed by a **no-op implementation** in the MVP. Its default rendering must be `null`/empty: no blank ad box, vendor JavaScript, pixels, network calls or cookies. Define `WEB_AD_PROVIDER=none` and `ADS_ENABLED=false`. Add AdSense as a separate post-PMF implementation only after owner approval, publisher/site approval and applicable consent.
- Do **not** insert ads in emails, auth screens, account creation, settings, unsubscribe pages, admin screens, or error pages. Avoid ads on private user dashboards in MVP. (Google allows ads behind login with additional crawler-login setup, but public content is simpler and less privacy-sensitive.)
- Public pages should contain meaningful *original* explanatory content, useful navigation and proper provenance, not merely mechanically republished release notes or scraped source descriptions. Do not generate low-value content to manipulate approval.
- Follow Google ad-placement policies, do not encourage clicking, and protect navigational/monitor buttons from accidental ad interactions.
- Configure site ownership verification, applicable `ads.txt`, disclosures and site privacy policy according to provider instructions. Verify placement after approval in staging and then activate the feature flag in production under owner approval.
- For personalized advertising offered to people in the EEA, UK, or Switzerland, implement a Google-certified TCF-compatible CMP as required by Google; address other regional privacy rules. Until a valid consent flow is ready, do not serve the applicable personalized ads in those regions. https://support.google.com/adsense/answer/13554116

### Adapter contract (illustrative)

```ts
type WebsiteAdProvider = 'none'; // MVP; extend to 'adsense' only after PMF
type WebsiteAdPlacement = 'public-app-detail';

type WebsiteAdsConfig = {
  enabled: boolean;
  provider: WebsiteAdProvider;
  publisherId?: string;
};

// Server guards: placement allowlist, consent requirements, verified approval flag.
// Client: load approved vendor script only after all server/client gates pass.
```

For Carbon future support: implement `carbon` as a **replacement** provider after publisher approval, and only after disabling/removing AdSense in accordance with exclusivity. Do not build a script proxy or self-host Carbon's ad tag.

## 4. Digest-email monetization: dormant first-party campaigns

Build a flexible but **disabled** `email_placements` module in `packages/notifications` that can eventually handle two kinds of optional inventory. `EMAIL_SPONSORS_ENABLED=false` must force the renderer to return `null` regardless of campaign status:

- **Affiliate:** manually selected offer from a legitimate affiliate program that explicitly permits email placements; store program name, exact approved destination URL, disclosure text, start/end, status. Program approval and per-network email rules are external gates.
- **Direct sponsor:** later, admin-approved creative and destination with campaign terms; clearly marked `Sponsored`.

Both render as simple static, email-client-safe content in HTML *and* plain-text versions. No JavaScript, iframes, third-party ads/trackers, remote pixel injection, per-recipient advertiser queries or Google/Carbon ad codes. No claims of sponsor endorsement, and no attachment to an update item in a way that could be confused with an alert.

### Sample email block

```text
SPONSORED / AFFILIATE LINK
Example product category — a relevant optional recommendation.
We may earn a commission if you purchase through this link.
https://approved-partner.example/path
```

The above is illustrative and must **not** be sent as an actual offer. If no valid approved campaign exists, omit it entirely.

### Suggested database changes

Keep existing `sponsors` and `sponsor_campaigns` (or refactor before migration if desired) but distinguish inventory channels and financial reporting. Suggested additions:

- `monetization_campaigns`: `id`, `channel` (`email`/`website_house`), `kind` (`affiliate`/`sponsor`), `partner_name`, `headline`, `body`, `approved_target_url`, `disclosure`, `starts_at`, `ends_at`, `status`, `created_by`, `approved_by`, `approved_at`.
- `digest_campaign_placements`: `digest_id`, `campaign_id`, `rendered_at`, `resend_message_id`, unique `(digest_id, campaign_id)`; these record sends, **not** read impressions.
- `campaign_clicks_daily` **optional** aggregate counts only; signed first-party redirect, no storing subscriber identity. Avoid per-user attribution and third-party tracking for MVP.
- `site_ad_settings`: optional config in environment or admin-only DB; prefer deploy-controlled feature flag at MVP. No need to record user-level ad exposure.

Do not store affiliate credentials, advertiser billing data or ad-network payout credentials in these tables. Keep secret values in Fly/GitHub secret managers.

### Validation and safety

- Admin-only CRUD. Activation requires explicit approval. Store immutable audit for edits/activation.
- Validate outbound links: HTTPS only, no localhost/private/link-local IP, no credentialed URLs, no dynamic/untrusted user substitutions, safe redirects, and URL allowlist/approved host where feasible.
- Encode/escape editorial creative; never render raw untrusted HTML from sponsor records.
- Exactly 0 or 1 placement per digest; do not attach to magic links, unsubscribe confirmations, account verification or other service messages.
- Keep marketing consent explicit and double-opt-in when feasible. Provide unsubscribe in email and avoid sending when suppressed, paused or unsubscribed.
- Affiliate compensation disclosure is visible (not hidden in fine print); ensure per-program requirements and consumer marketing laws are satisfied.

## 5. Agent implementation tasks

### Phase A: ad-ready website (during MVP, before PMF)

1. Add `WebsiteAdSlot` interface and mock/no-op provider; disabled-by-default flag.
2. Implement a no-op public-page placement in layout; test accessibility, hydration, mobile behavior and that no visible ad container or external network call occurs.
3. Write a **future** deployment checklist for Google AdSense verification, original-content criteria, policies, `ads.txt`, privacy/CMP obligations. Do not apply to an ad network or load live scripts as part of MVP.
4. Build tests confirming `none`, no approval and denied/missing regional consent all suppress the vendor script.

### Phase B: dormant email monetization (free, ad-free MVP)

1. Add an optional email campaign schema + Drizzle migration and draft/preview-only admin interface with audit trail; do not enable live campaign activation during MVP.
2. Email composer selects **none** in MVP/beta, including when a campaign exists. After a separate future monetization launch, select at most one approved campaign; robust no-update suppression and dedupe always apply.
3. Render static, accessible HTML and text versions; include explicit `SPONSORED` or `AFFILIATE LINK` disclosure.
4. Test that nothing from `Google AdSense` or `Carbon Ads` appears in email MIME output; test consent/unsubscribe and malicious ad-creative sanitization.
5. Build a mock campaign fixture, but never activate it for real subscribers.

### Phase C: after product-market fit (not an MVP deliverable)

- The owner first reviews product-market fit (for example, 30-day retention, recurring monitor usage, digest click-through and qualitative feedback). There is no automatic numerical trigger. **Only an explicit owner decision** may begin monetization work.
- Then the owner applies to AdSense and/or eligible affiliate programs, supplies verified publisher/partner IDs **outside Git**, reviews privacy/CMP and tax/payment requirements, and authorizes the first production activation.
- Codex may prepare compliance checklists, code and dry-run previews, but cannot obtain approval, substitute a publisher account or legally consent for users.
- Once traffic grows, compare actual net earnings and operational friction; assess Carbon eligibility at >=10k monthly pageviews if replacing AdSense makes sense. Evaluate direct newsletter sponsorships using a separate first-party ad sales workflow when audience size supports it.

## 6. Monitoring, acceptance, and financial expectations

Metrics to collect: approved provider state, pageview count (privacy-considerate aggregate), site-ad request/error counters where allowed, digest delivery counts, affiliate link clicks (aggregate only), revenue self-reported from network statements, unsubscribes/complaints and audience retention. Avoid copying third-party attribution or user email to analytics.

**Acceptance tests:**

- [ ] Public release/app detail pages work normally with ad provider disabled.
- [ ] No ad code can load before site approval and necessary consent settings.
- [ ] AdSense only runs on permitted public website pages; never in email HTML, text or image URL.
- [ ] No auto-switch to Carbon: explicit owner approval and exclusivity check are required.
- [ ] Digest campaign is skipped if absent, expired, unapproved, unsafe or unsupported.
- [ ] **Zero** affiliate/direct placements in MVP/beta. A future enabled digest can include at most one explicitly labeled placement.
- [ ] Marketing opt-in, suppressions and unsubscribe tested end-to-end.
- [ ] No ad-only digests and no partner data shared without authorization.
- [ ] Reporting makes no unverified claim of ad revenue or views.

### Financial reality check

At Carbon's typical reported ~$1.50–$2.30 CPM, even **10,000 fully monetized impressions** would produce only about **$15–$23/month** before any network-specific adjustments; 10,000 pageviews do not guarantee 10,000 billable impressions. A newly launched service might have **$0 in ad revenue**, including while awaiting AdSense approval. Affiliate programs pay only on eligible conversions, with approval and terms varying.

Treat monetization as **intentionally deferred beyond launch**, and build the app so useful free notifications continue when every advertising provider is unavailable. **PMF and explicit owner approval are mandatory gates**, even if a network independently approves the site.
