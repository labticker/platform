import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyRelease, eligibleForDigest, GitHubReleasesAdapter, majorVersionIncrement, normalizeVersionTag,
  parseGitHubReleases, prepareReleaseBatch, releaseDedupeKey } from '../src/index.js';

const observedAt = new Date('2026-10-30T12:00:00Z');
const source = { kind: 'github-releases', repository: 'owner/project', channel: 'stable' } as const;
function fixture(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: 42, draft: false, prerelease: false, tag_name: 'v2.0.0', name: 'Release 2',
    html_url: 'https://github.com/owner/project/releases/tag/v2.0.0',
    published_at: '2026-10-29T14:00:00Z', body: 'BREAKING CHANGE: old configuration removed.', ...extra };
}

test('GitHub contract accepts stable official releases and excludes drafts/prereleases', () => {
  const results = parseGitHubReleases([fixture(), fixture({ id: 43, prerelease: true }), fixture({ id: 44, draft: true })], source.repository, observedAt);
  assert.equal(results.length, 1);
  assert.equal(results[0]?.guid, '42');
  assert.equal(results[0]?.sourceKey, 'github-releases:owner/project');
  assert.equal(results[0]?.publishedAt?.toISOString(), '2026-10-29T14:00:00.000Z');
  assert.equal(results[0]?.observedAt.toISOString(), observedAt.toISOString());
  assert.equal(parseGitHubReleases([fixture({ name: null, body: null })], source.repository, observedAt)[0]?.title, 'v2.0.0');
});

test('GitHub external boundary rejects malformed/unsafe payloads', () => {
  for (const malformed of [null, {}, [fixture({ id: '42' })], [fixture({ draft: null })], [fixture({ tag_name: '' })],
    [fixture({ published_at: 'yesterday' })], [fixture({ html_url: 'https://evil.example/releases/tag/2' })],
    [fixture({ html_url: 'https://github.com/other/project/releases/tag/2' })],
    [fixture({ html_url: 'https://user:password@github.com/owner/project/releases/tag/2' })],
    [fixture({ body: 'x'.repeat(262_145) })], Array.from({ length: 101 }, () => fixture())]) {
    assert.throws(() => parseGitHubReleases(malformed, source.repository, observedAt));
  }
  assert.throws(() => parseGitHubReleases([], '../../metadata', observedAt));
});

test('GitHub polling preserves conditional cache and distinguishes unchanged from empty feeds', async () => {
  let calls = 0;
  const adapter = new GitHubReleasesAdapter({ async get(url, cache) {
    calls++; assert.match(url, /^https:\/\/api\.github\.com\/repos\/owner\/project\/releases\?/);
    assert.equal(cache?.etag, 'old');
    return { status: 304, headers: { etag: 'new' }, body: '' };
  } });
  assert.deepEqual(await adapter.fetchReleases(source, { etag: 'old' }), { status: 'not-modified', cache: { etag: 'new', lastModified: undefined } });
  assert.equal(calls, 1);
  const empty = new GitHubReleasesAdapter({ async get() { return { status: 200, headers: {}, body: '[]' }; } });
  assert.deepEqual((await empty.fetchReleases(source)).status, 'modified');
});
test('asset-heavy sources use bounded smaller pages without dropping the next page',async()=>{
 const urls:string[]=[];
 const adapter=new GitHubReleasesAdapter({async get(url){urls.push(url);return {status:200,headers:{},body:JSON.stringify(urls.length===1?[fixture(),fixture({id:43})]:[fixture({id:44})])};}},()=>observedAt,5,'recent-window',2);
 const result=await adapter.fetchReleases(source);assert.equal(result.status,'modified');if(result.status==='modified')assert.equal(result.releases.length,3);
 assert.ok(urls[0]?.includes('per_page=2&page=1'));assert.ok(urls[1]?.includes('per_page=2&page=2'));
 await assert.rejects(new GitHubReleasesAdapter(undefined,undefined,5,'recent-window',0).fetchReleases(source),/page size/);
});

test('GitHub polling does not silently lose pages or convert outages to empty success', async () => {
  let pages = 0;
  const adapter = new GitHubReleasesAdapter({ async get(_url, cache) {
    pages++;
    if (pages === 2) assert.deepEqual(cache, {});
    return { status: 200, headers: {}, body: JSON.stringify(pages === 1 ? Array.from({ length: 100 }, (_, id) => fixture({ id: id + 1 })) : [fixture({ id: 101 })]) };
  } }, () => observedAt);
  const response = await adapter.fetchReleases(source);
  assert.equal(response.status === 'modified' && response.releases.length, 101);
  const unavailable = new GitHubReleasesAdapter({ async get() { return { status: 429, headers: {}, body: 'rate limited' }; } });
  await assert.rejects(unavailable.fetchReleases(source), /HTTP 429/);
  const incomplete = new GitHubReleasesAdapter({ async get() { return { status: 200, headers: {}, body: JSON.stringify(Array.from({ length: 100 }, () => fixture())) }; } }, () => observedAt, 1);
  await assert.rejects(incomplete.fetchReleases(source), /pagination bound/);
  const recent=new GitHubReleasesAdapter({async get(){return {status:200,headers:{},body:JSON.stringify(Array.from({length:100},(_,index)=>fixture({id:index+1})))};}},()=>observedAt,1,'recent-window');
  const limited=await recent.fetchReleases(source);
  assert.equal(limited.status==='modified'&&limited.historyTruncated,true);
  assert.equal(limited.status==='modified'&&limited.releases.length,100);
});

test('normalization only labels explicit reliable semantic version increments', () => {
  assert.equal(normalizeVersionTag(' v2.3.4 '), '2.3.4');
  assert.equal(normalizeVersionTag('release-2.3'), 'release-2.3');
  assert.equal(majorVersionIncrement('v1.9.0', 'v2.0.0', 'semver'), true);
  for (const [previous, current, scheme] of [
    ['2025.1.0', '2026.1.0', 'calver'], ['2025.1.0', '2026.1.0', 'semver'],
    ['1.0.0', '2.0.0', 'unknown'], ['1.0.0', '2.0.0-beta', 'semver'],
    ['1.0', '2.0', 'semver'], ['2.0.0', '1.0.0', 'semver'],
  ] as const) assert.equal(majorVersionIncrement(previous, current, scheme), false);
});

function classify(notesText: string) {
  return classifyRelease({ notesText, releaseUrl: 'https://github.com/owner/project/releases/tag/v2.0.0',
    previousTag: '1.0.0', currentTag: '2.0.0', versionScheme: 'unknown' });
}

test('advisory classifier emits bounded evidence and official source links', () => {
  const warnings = classify('BREAKING CHANGE: old API removed. Manual migration is required. This setting is deprecated.');
  assert.deepEqual(warnings.map((warning) => warning.code), ['possible_breaking_change', 'migration_mentioned', 'deprecation_mentioned']);
  assert.ok(warnings.every((warning) => warning.advisory && warning.evidence.length <= 240 && warning.releaseUrl.startsWith('https://github.com/')));
  assert.equal(classify('This release is not backwards compatible.')[0]?.code, 'possible_breaking_change');
  assert.equal(classify('Incompatible with previous versions.')[0]?.code, 'possible_breaking_change');
});

test('classifier handles negation per clause without hiding later positive evidence', () => {
  assert.deepEqual(classify('No breaking changes. No migration required. Not deprecated. Nothing removed.'), []);
  assert.deepEqual(classify('Breaking changes were not introduced. Migration required: none.'), []);
  assert.equal(classify('No breaking changes in the client, but BREAKING CHANGE in the server.')[0]?.code, 'possible_breaking_change');
  assert.equal(classify('No migration required. Manual migration needed for legacy databases.')[0]?.code, 'migration_mentioned');
  assert.deepEqual(classify('<script>BREAKING CHANGE</script><p>Fix typo.</p>'), []);
});

test('repeat scans produce stable application-scoped keys and initial history remains backfill', () => {
  const release = parseGitHubReleases([fixture()], source.repository, observedAt)[0]!;
  const first = prepareReleaseBatch('stable-app-id', [release, release], true);
  const repeat = prepareReleaseBatch('stable-app-id', [{ ...release, observedAt: new Date('2026-11-01') }], false);
  assert.equal(first.length, 1);
  assert.equal(first[0]?.dedupeKey, repeat[0]?.dedupeKey);
  assert.equal(first[0]?.dedupeKey, releaseDedupeKey('stable-app-id', { ...release, sourceKey: 'github-releases:new-owner/new-name' }));
  assert.notEqual(first[0]?.dedupeKey, releaseDedupeKey('other-app-id', release));
  assert.equal(first[0]?.isBackfill, true);
  assert.equal(eligibleForDigest(first[0]!, new Date('2026-10-01'), observedAt), false);
  assert.equal(eligibleForDigest(repeat[0]!, new Date('2026-10-31'), new Date('2026-11-02')), true);
  assert.equal(eligibleForDigest(repeat[0]!, new Date('2026-11-01'), new Date('2026-11-02')), false);
  const noGuid = { ...release, guid: null };
  assert.equal(releaseDedupeKey('app', noGuid), releaseDedupeKey('app', { ...noGuid, sourceKey: 'rss:mirror' }));
  assert.equal(releaseDedupeKey('app', { ...noGuid, releaseUrl: '', versionTag: 'v2.0.0' }), releaseDedupeKey('app', { ...noGuid, releaseUrl: '', versionTag: '2.0.0' }));
});
