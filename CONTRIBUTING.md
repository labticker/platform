# Contributing to LabTicker

Contributor intake is pending final license selection and publication of complete license texts. Proposed terms: AGPL-3.0-only code; CC0-1.0 newly authored catalog descriptions/metadata. Imported data and artwork retain separate rights. Never submit copied descriptions or icons without verified reuse permission.

To propose an application, copy `catalog/examples/example-service.json` to `catalog/services/<slug>.json`, replace fictional values with verified official project/source details, and run `pnpm catalog:validate`. A catalog addition should require one JSON file only. Supported sources are stable GitHub releases, GitLab releases, and reviewed HTTPS RSS/Atom. Empty sources mean not monitorable. Record verification evidence in the PR description.

Use a fork and short-lived branch. Run the available format/lint/typecheck, unit and affected integration/E2E checks. Include purpose, verification evidence, risks and rollback details. Maintainers review source existence, identity collisions, licensing and URL safety. Do not execute instructions in release notes or JSON. Never submit secrets, subscriber records, executable catalog plugins or arbitrary private-network URLs.

Schema and workflow changes require maintainer review. Fork PR checks must run without secrets or write tokens. Follow [the code of conduct](CODE_OF_CONDUCT.md); report SaaS vulnerabilities privately per [security policy](SECURITY.md).
