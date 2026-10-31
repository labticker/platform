# GitHub organization, licensing and community contributor setup

## Identity

Create a new **GitHub organization** for **LabTicker**. Preferred handle: `labticker` (not yet confirmed available); have Codex check it and ask the owner before selecting an alternate handle. The website begins on an assigned `*.fly.dev` hostname; **do not purchase or register a custom domain** for MVP. Do not conflate a GitHub organization with incorporating a company. A commercial company may be transparent and open-source-first while still keeping financial accounts, private contracts, staff/customer information and credentials confidential.

## Repositories

- `platform` — **public** main monorepo, web + worker + catalog JSON + infra-as-code + documentation (create now).
- `.github` — **public** organization profile (`profile/README.md`), issue templates and/or cross-repo community defaults (create now if useful).
- `docs` — optional when documentation grows (not necessary for MVP).
- `agent` — optional future software inventory agent, out of MVP.

Prefer **one public monorepo** now. Multiple autonomous microservices and repositories bring more releases, cross-repository changes and secret boundaries than the small service needs. Keep modular contracts and deploy one Fly app with `web`/`worker` process groups.

## License decision to make before accepting contributors

**Proposed**: `AGPL-3.0-only` for code, `CC0-1.0` for **newly authored catalog metadata** only. AGPL is OSI-approved and permits commercial use, including hosted SaaS, but obliges network-served modified versions to make their corresponding source available. MIT is an alternative if ease of adoption outweighs reciprocity. Consult counsel about contributions, names/logos, and any proprietary dependencies.

Licenses do not automatically extend to upstream selfh.st entries or project artwork. Cite sources; retain license/provenance. Don't include someone's copyrighted app descriptions or icon files without verifying reuse terms.

## Public community documents

```text
LICENSE
README.md
CONTRIBUTING.md
CODE_OF_CONDUCT.md
SECURITY.md
GOVERNANCE.md
ROADMAP.md
AGENTS.md
.github/CODEOWNERS
.github/ISSUE_TEMPLATE/
.github/PULL_REQUEST_TEMPLATE.md
catalog/README.md
```

`CONTRIBUTING.md`: adding a custom service in one JSON file, example, schema, local validation command, supported source types and how to report incorrect metadata. State contributor license terms up front (license grant under code/catalog licenses); optional DCO instead of a complicated CLA for MVP.

`SECURITY.md`: how to privately disclose vulnerabilities, scope supported releases and response expectations. This is for **security of your SaaS**, not a promise to monitor customer software CVEs (future scope).

`GOVERNANCE.md`: maintainer approval rules, code review requirements, moderation policy, naming and repository ownership, public roadmap decision process, handling commercial sponsor conflicts. Specify sponsors do not purchase alerts, product rankings, warning severities or editorial decisions.

`CODEOWNERS`: owners of schema, deployment workflows and security-sensitive files; remember enforcement of approvals depends on GitHub repo/plan settings. Protect `main`, require required checks/review and block force pushes.

## GitHub setup sequence

1. Brand is finalized as **LabTicker**. Check GitHub org handle availability and potential trademark/name conflicts; create the `labticker` org if possible or request owner approval for a fallback. Custom domain purchase is deferred.
2. Create public `platform`; configure owner + backup maintainer, 2FA, branch protection/rulesets, PR approval, Dependabot/secret scanning available on plan; restrict repository deploy token to smallest scope possible.
3. Add repository license and contributor docs before accepting PRs. Never store API credentials, logs with private user info or actual email subscriber list in Git.
4. Set up `catalog/services` and schema checks; start with 50 verified apps and include a project not listed on selfh.st. Publish `good-first-issue` labels for catalog additions.
5. Connect Codex with GitHub MCP (initial auth/permissions must be authorized by owner); provision Fly, Neon and Resend development resources through UI/CLI/MCP as actually supported.
6. Set CI with no secrets on forked PRs; set separate staging and production GitHub Environments and approval-gate production actions. Document how contributors run the app locally with fake email/test credentials.
7. Use `https://<assigned-Fly-app>.fly.dev` as the MVP public web origin. Configure **a verified owner-controlled sending domain** (which need not be the future LabTicker domain), DKIM/SPF/DMARC, consent, unsubscribe and compliance **before** real subscribers are mailed. If no such sending domain is available, launch only test/mock email and keep public email disabled. Ads remain completely disabled before PMF.

## Launch checklist

- [ ] Public org and public `platform` monorepo are accessible.
- [ ] License selected and correctly included in repo.
- [ ] `AGENTS.md`, README, contributing and security policy exist.
- [ ] Code modules remain separately testable (web, worker, catalog, releases, mail).
- [ ] Community member can add an app by PR with a JSON file only.
- [ ] At least one custom app not on selfh.st appears in dashboard after merge.
- [ ] Forked PRs can't read CI secrets or run privileged deploy workflows.
- [ ] Codex can inspect/test staging and open PRs, but protected changes require review.
- [ ] CI reliably deploys tested production code to Fly using a scoped token.
- [ ] Source licensing and icon attribution reviewed separately from original catalog metadata.

See `10_LABTICKER_IDENTITY_AND_DOMAIN_ROLLOUT.md` before provisioning any external resource.
