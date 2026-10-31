# Catalog verification evidence

Checked 2026-10-31 UTC (2026-10-30 America/Edmonton).

The 50 definitions in `services/` were authored independently using project names, official repository URLs, and original short descriptions. No descriptions or artwork were copied from selfh.st. `verification.json` records an actual unauthenticated GitHub Releases API request, check timestamp, observed stable tag and official release URL for every definition. All 50 returned a non-draft, non-prerelease release. These checks establish working source endpoints at check time; they do not establish future uptime or complete stable-version semantics. In particular, calendar-versioned projects need explicit non-semver handling in the release module.

No credentials or paid resources were used. GitHub release API limits require conditional requests and backoff in the worker. Catalog JSON validation and runtime source safety remain separate checks.

## selfh.st decision

Importer remains disabled/unimplemented: reuse permission, canonical export contract and feed format have not been verified sufficiently to authorize ingestion. The official [about page](https://selfh.st/apps-about/) was read on this date; it describes custom stable-release feeds but does not provide an explicit commercial-reuse grant or versioned export contract. The historical [selfhst/apps repository](https://github.com/selfhst/apps) returned 404 during verification. This is not permission to use a mirror. No maintainer was contacted and no third-party data was imported.

Every seed is **not sourced from selfh.st**, satisfying independent-source resilience. The stronger checklist requirement for an application **absent from the current selfh.st directory** is still open: absence cannot be proved from these checks, and is not claimed. Confirm a current directory search/export and document one absent application before marking that acceptance item complete.

## Limits and remaining acceptance

- Full 20-case adapter parsing spike (GitLab, missing releases, duplicate names, unusual tags, multiple channels) remains open. Current seeds use verified GitHub release sources.
- GitHub repository URLs are used as authoritative project websites; optional branded homepage enrichment can be contributed later.
- License decisions apply only to original metadata; upstream release notes and project icons retain their own rights.
- Re-run source checks during review and observe current quotas; do not make live endpoint availability a secret-dependent fork CI requirement.
