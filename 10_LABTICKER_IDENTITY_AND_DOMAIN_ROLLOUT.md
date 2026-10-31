# LabTicker — Brand, `fly.dev` Launch and Later Custom-Domain Migration

**Decision date:** 2026-10-30  
**Authority:** Final owner decision; overrides legacy domain/brand examples in earlier planning sections.  
**Product name:** **LabTicker**  
**Tagline:** **Update your homelab. Without the homework.**  
**Launch web domain:** Fly.io-provided `*.fly.dev`, not a custom domain  
**Custom LabTicker domain:** Deferred; do not purchase one during MVP.

## 1. Naming and availability

| Component | Preference | Rule |
|---|---|---|
| Public product name | `LabTicker` | Fixed across web, emails, docs, GitHub |
| GitHub organization | `labticker` | Check availability; not a confirmed/created handle |
| GitHub repo | `platform` | Public monorepo once org is available |
| Fly app slug | `labticker` | Check availability; app naming may be global |
| Fly HTTPS origin | `https://labticker.fly.dev` | **Example only**; valid only if Fly assigns slug `labticker` |
| Fallback Fly origin | `https://<actual-fly-app>.fly.dev` | Get actual URL from Fly; do not invent or hardcode |
| Later branded domain | Unselected | No purchase, registrar account, DNS or domain migration during launch |

If any preferred handle is unavailable, propose 2–3 clear, available alternatives for owner approval. Do not silently choose a confusing brand or claim availability. The GitHub org handle and Fly app slug need not be identical.

## 2. Origin configuration

Store the **real deployed origin** in one canonical `APP_URL` variable. For example, **only if allocated**, this could be:

```dotenv
APP_NAME=LabTicker
APP_URL=https://labticker.fly.dev
AUTH_URL=https://labticker.fly.dev
EMAIL_DELIVERY_MODE=mock
PUBLIC_EMAIL_ENABLED=false
ADS_ENABLED=false
```

Build `APP_URL` into canonical links, security headers, auth callback URLs, magic links, unsubscribe and preference URLs, webhooks registered with Resend, site metadata, privacy pages, sitemaps, robots and PostHog allowlist/configuration as appropriate. Use HTTPS and an exact allowlisted hostname; forbid redirecting auth links to arbitrary external origins. If fly name changes, update env and test all callbacks. Never build a user's sign-in or unsubscribe link from an untrusted `Host` header.

Fly provides HTTPS and public DNS for the `fly.dev` web hostname on successful deployment; no separate domain purchase is required. See https://fly.io/web-app-with-postgres/ and https://fly.io/docs/flyctl/integrating/ (choose Neon, NOT Fly Managed Postgres, for this cost-sensitive MVP).

## 3. **Critical**: a website domain is not a Resend sender domain

`*.fly.dev` is a Fly-controlled website hostname. The owner does **not** control its DNS zone to add Resend's sending validation records. Never assume the ability to verify or send from `labticker.fly.dev`. Public email delivery (including email magic links) needs a **separately verified sender domain** controlled by the owner, such as a subdomain of a domain they already own, or a future purchased LabTicker domain. No sending domain has been confirmed in this plan.

**Two independent readiness stages:**

- **Stage A — Web + product preview:** Fly HTTPS web app, catalog, browser analytics, worker, local/dev mock inbox, fixture-generated sample digests, simulated Resend webhooks, site signup landing / waitlist only if legally compliant. Keep `EMAIL_DELIVERY_MODE=mock` and `PUBLIC_EMAIL_ENABLED=false`. Public users must not be promised live email alerts or magic-link sign-in until functioning. Optional GitHub OAuth for a limited pilot if Codex configures a real GitHub OAuth application and receives owner approval; otherwise keep auth test-only.
- **Stage B — Live public email:** Select an existing owned domain (owner confirms) **or** later buy a branded one; add required DKIM, SPF and recommended DMARC records, verify it in Resend, configure separate `login@...` and `updates@...` sender identities, confirm unsubscribe and consent requirements and verified webhook signatures, test real delivery to authorized recipients, confirm quotas and complaint suppression, then explicitly set `EMAIL_DELIVERY_MODE=resend` and `PUBLIC_EMAIL_ENABLED=true` for deployment. If not complete, do not declare the full email SaaS publicly launched.

Resend sandbox/test tooling can simulate delivery/bounce/complaint via addresses at `resend.dev`; that is not a substitute for domain ownership and broad public sending. See https://resend.com/changelog/sending-test-emails and https://resend.com/changelog/three-domains-on-the-free-tier.

**Avoid unnecessary dependency:** the owner can operate the **LabTicker web app** on Fly without owning the *LabTicker-branded* domain. The user-facing digest feature still needs an owner-controlled verified email-sender domain before production readiness.

## 4. Security and cost policy

- Do not purchase any domain; no Namecheap tokens in the repository or Codex.
- Do not start paid resources or exceed free tiers without owner approval. Fly Machines can bill even without a custom domain.
- Keep public repo secrets outside Git; use Fly secrets, protected GitHub environments and scoped API tokens.
- Stage B activation requires documented approval for live sending; AI may test fixture emails and approved addresses only.
- Preserve ad-free MVP: no live ad network code requests or sponsor placements; PostHog cookieless analytics and first-party delivery metrics remain active per privacy specification.
- Protect production DB and subscriber data from AI MCP administrative tools; aggregate-only analytics for Codex.

## 5. Later custom-domain migration (not MVP)

Once the owner purchases a domain:

1. Verify ownership and domain/trademark fit, then bind it to Fly and issue/confirm TLS certificate.
2. Update `APP_URL`/`AUTH_URL` and all OAuth callback/allowed-host origins. Decide canonical origin, migration notice and redirects before changing public links.
3. Independently verify an email sender domain with Resend DKIM/SPF/DMARC. Do not assume web DNS configuration covers email delivery.
4. Update signed-link strategy for login/unsubscribe, external email CTA links, webhook endpoints and PostHog config.
5. Keep Fly's previous origin redirect for a reasonable period; check Search Console/canonical pages, no broken unsubscribe links and successful digests.
6. Annotate analytics reports with the domain migration date to avoid interpreting host-level traffic shifts as changes in acquisition.

## 6. Acceptance criteria for Codex

- [ ] LabTicker name and tagline consistently appear in brand-facing UI and docs.
- [ ] GitHub org and Fly name availability checked, with actual assigned names in deployment notes.
- [ ] Web app runs over HTTPS at assigned `.fly.dev` URL and links stay on configured origin.
- [ ] No purchased domain or custom DNS required for web deployment.
- [ ] Worker and website can be tested end-to-end with mock email (release -> digest).
- [ ] Auth, callback, unsubscribe and sitemap URLs use `APP_URL`, not guessed hostname.
- [ ] Public email/auth states clearly gated behind verified sender requirements.
- [ ] No attempt to send from an unverified `*.fly.dev` email sender.
- [ ] Ads disabled, PostHog privacy rules and Resend webhook handling preserved.
- [ ] `MIGRATION_DOMAIN.md` runbook provided for optional future custom-domain rollout.
