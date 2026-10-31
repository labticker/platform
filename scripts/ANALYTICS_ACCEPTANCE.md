# Enabled analytics browser fixture

This isolated loopback fixture bundles the installed analytics adapter and PostHog SDK with esbuild.
It does not add a product route or production switch. The fake project key is not an account credential.
Opening the fixture alone does not initialize the SDK; the controller initializes it only after installing
an interception route for every external destination. All vendor requests are fulfilled locally; no real
PostHog ingestion, account mutation or advertising request occurs.

In one terminal from the monorepo root:

```powershell
$env:LOCAL_ANALYTICS_FIXTURE_ENABLED='true'
pnpm exec tsx scripts/analytics-browser-fixture.ts
```

In a second terminal:

```powershell
npx --yes --package @playwright/cli playwright-cli -s=analytics-acceptance open about:blank
npx --yes --package @playwright/cli playwright-cli -s=analytics-acceptance run-code --filename scripts/analytics-browser-acceptance.js
npx --yes --package @playwright/cli playwright-cli -s=analytics-acceptance eval '() => window.analyticsAcceptanceResult'
npx --yes --package @playwright/cli playwright-cli -s=analytics-acceptance close
```

Stop the fixture server with Ctrl+C afterward. Start a fresh browser session for each run; close any prior
analytics-acceptance session first. Generated CLI artifacts stay in the ignored .playwright-cli directory.

The actual SDK filters HeadlessChrome as a bot. The fixture emulates an ordinary Chrome user-agent solely
inside its browser context to exercise capture; production bot-filter policy remains unchanged. It waits
for the SDK's real batching interval and decodes its batch envelope. It asserts approved pageviews only,
canonical route templates, the public project token, cookieless identity sentinel and person processing off;
the coarse community acquisition enum survives while raw UTM campaign/source query data stays absent;
query/email/referrer and person-update enrichment are absent. Cookies, localStorage and sessionStorage stay
empty. Replay/advertising/unrelated vendor attempts fail acceptance. DNT and explicit opt-out create no
additional vendor calls. Successful evidence is two sanitized captures and two intercepted vendor requests.

This local privacy proof does not validate a real PostHog project's ingestion/retention/region settings,
quotas, consent policy or MCP analytical queries. Those remain separate rollout acceptance gates.

## Production application container

Build with Docker's default no-op analytics for previews. An explicitly reviewed PostHog build uses
`ANALYTICS_PROVIDER=posthog`, `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST` build arguments.
The public project routing token is embedded in client assets; never pass a private API key. Turborepo
includes these values in build inputs. Runtime-only client environment changes cannot replace a rebuild.
The protected preview workflow intentionally keeps its no-op default.

For isolated application acceptance, build tag `labticker:analytics-acceptance` with the fake public key
`phc_local_fixture_public` and approved host `https://us.i.posthog.com`, then run it bound exclusively to
`127.0.0.1:3103:8080`. Use a fresh Playwright CLI session opened to about:blank and run
`scripts/app-browser-analytics-acceptance.js`, then evaluate `window.applicationAnalyticsAcceptance`.
The controller proxies a synthetic HTTPS origin to the loopback container and intercepts all vendor
requests before navigation. No domain, DNS or real ingestion is used. It checks real catalog controls,
coarse acquisition, sanitized SDK payloads, route pageviews, empty analytics storage and secure-cookie
opt-out across reload. Close the browser and stop the temporary container afterward.
