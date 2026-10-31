# Open-source JSON catalog and ingestion design

**Status:** Implement in v0.1. **Owner:** new public GitHub organization. **Source of truth:** merged Git repository plus controlled external importers. **Product:** homelab release-monitoring SaaS.

## Objectives

1. Users pick recognizable software, not GitHub URLs or RSS feeds.
2. Any contributor can add a missing homelab application by opening a PR with one validated JSON file.
3. selfh.st remains a *source*, not a dependency or exclusive authority. Do not treat its old public mirror as the canonical live API.
4. Changes to imported records never erase monitored apps, notification history or existing subscriptions.
5. Catalog metadata is versioned, reviewed, traceable, reproducible and auditable.
6. No executable plugins, custom scripts or server-side fetch code are ever supplied by catalog entries.

## Repository and file layout

```text
platform/
  catalog/
    README.md
    schema/
      service.schema.json
    services/
      my-app.json
      another-app.json
    examples/
      example-service.json
  packages/catalog/src/
    schema.ts                 # Zod parsing from JSON Schema-aligned contract
    import-custom.ts         # Git-tracked catalog loader
    import-selfhst.ts        # Data-source adapter if permission/data are confirmed
    normalize.ts
    reconcile.ts
    validate-url.ts
  .github/workflows/catalog-validate.yml
  .github/CODEOWNERS
```

## Proposed stable JSON format, version 1

```json
{
  "$schema": "../schema/service.schema.json",
  "schemaVersion": 1,
  "slug": "example-monitor",
  "name": "Example Monitor",
  "summary": "A fictional example for validating catalog contributions.",
  "category": "monitoring",
  "aliases": ["ExampleMonitor"],
  "website": "https://example.com/",
  "repository": {"provider": "github", "url": "https://github.com/example/example-monitor"},
  "releaseSources": [
    {"kind": "github-releases", "repository": "example/example-monitor", "channel": "stable"}
  ],
  "catalog": {"mode": "add"}
}
```

This example is a **fixture only**; it is not a claimed working release source. To override an imported record, use `"catalog": {"mode":"override","upstreamKey":"verified-source-id"}`. `upstreamKey` format is determined by a verified adapter contract; never invent a selfh.st identifier. For a source without an API or release channel, allow `releaseSources: []` but flag it as **Not monitorable** and disallow alert subscriptions until validated.

### Supported release sources

- `github-releases`: GitHub owner/repo, stable releases (ignore pre-releases by default).
- `gitlab-releases`: canonical GitLab project URL or stable project path, normalizing percent-encoding.
- `rss`: direct HTTPS RSS/Atom feed URL verified against a safe egress policy.
- Later: Forgejo, Codeberg, package registries, vendor version endpoints. Add adapters rather than arbitrary JSON code.

Every release is normalized to an immutable internal app ID and stable release key. Multiple sources for one app are unioned with deduplication by canonical URL/tag where trustworthy. Avoid matching solely by app name.

## Import and override behavior

1. Validate and load approved Git JSON definitions; record content hash and Git commit.
2. Fetch selfh.st metadata **only when the current authoritative and permitted method has been validated**, recording attribution and license/provenance per field. If unavailable, use the curated JSON catalog with no degradation.
3. Normalize source records into an internal `NormalizedCatalogEntry` contract.
4. Resolve identities in this order: internal stable slug/alias map; verified provider ID; explicitly reviewed repository URL match; otherwise queue for human review. Never collapse coincidentally similarly named apps.
5. Apply merged fields: Git override wins for fields it explicitly sets, then trusted upstream data, then curated fallback. Empty/null fields cannot silently delete populated values.
6. Preserve existing application IDs and subscriptions. Missing upstream projects are marked `stale` for review rather than deleted. `hidden` and `disabled` remain separate states.
7. Persist provenance and a structured change log, so maintainers can inspect upstream drift and revert a bad import.
8. Release monitoring always uses the final, validated source definition.

**Example precedence:** If selfh.st provides a project's name, icon and GitHub URL, but a community JSON override updates the repository URL to a new GitLab project, Git-tracked fields win. All previously subscribed users remain subscribed to the existing internal app ID.

## CI validation pipeline (must pass for every PR)

- JSON syntax + JSON Schema draft 2020-12 + Zod runtime validation and tests.
- File name matches `slug`; slugs unique; aliases normalized; allowed categories; input size limits; no invisible/control Unicode or unsafe HTML.
- Providers match exact field contracts; URLs are valid HTTPS, no usernames/passwords, no fragments, no redirects to unsupported hosts, no localhost/loopback/private/link-local/metadata destinations.
- Guard against DNS rebinding and redirect-based SSRF at **fetch time too**; a JSON Schema check alone does not establish safe network access. DNS resolution, outbound networking, TLS, response-size and timeout policies must apply at runtime.
- Verify source exists and type when the PR environment can safely access public endpoints; rate-limit and cache checks. Remote verification is advisory if upstream is unavailable; no secrets for forked PR workflows.
- Check duplicate repository URLs and slug collisions; warn on low-confidence possible duplicates for maintainer review.
- Do not execute any scripts from changed PR content or check out untrusted PR head with write credentials.
- `CODEOWNERS` protects catalog schema and workflows; community content is merged by authorized maintainers.

## Maintainer and user workflows

**Contributor:** fork `platform`, copy the template into `catalog/services/<slug>.json`, validate locally with `pnpm catalog:validate`, submit PR. CI posts exact error messages; maintainer verifies upstream repository and source. When merged into main, the importer syncs the JSON registry.

**Admin:** correct bad metadata through a new Git PR (preferred) or emergency dashboard override with an audit log. Never silently accept external user-submitted URLs for live polling.

**User:** search catalog, subscribe with one click, see latest release status. Show `Tracking`, `No supported release source`, or `Source unhealthy` explicitly. Expose a link to propose a missing application on GitHub.

## Open-source metadata and licensing

- Proposed **application code** license: `AGPL-3.0-only`, subject to legal review. AGPL encourages publication of modifications offered over a network; MIT/Apache-2.0 are reasonable alternatives for fewer adoption barriers.
- Proposed license for **new, original community-contributed catalog facts/metadata**: `CC0-1.0`, clearly explained in `CONTRIBUTING.md`. Factual names and URLs are not necessarily copyrighted, but descriptions and logos may be.
- Imported selfh.st material retains its own usage conditions; **do not relicense upstream content as CC0**. Keep source records separated and confirm current right to reuse data. The `selfhst/icons` repository is marked CC BY 4.0, so logos require separate checks and attribution.
- Company governance, public roadmap and financial/sponsorship transparency can be public. Company shares, contracts, private customer data and credentials do not become open source by publishing the code.

## Definition of done

- At least 50 verified active apps, including at least one valid project not sourced from selfh.st.
- Contributor PR can add an application using only a JSON file, with no application-code change.
- Invalid/duplicated/unsafe definitions fail PR CI.
- Source disappearance and JSON corrections preserve subscriptions and historical digests.
- Offline catalog fixture import works with selfh.st unavailable.
- All catalog changes auditable by commit and last import status.
