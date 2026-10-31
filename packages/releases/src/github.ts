import { SafeHttpClient } from './safe-http.js';
import type { HttpReply } from './safe-http.js';
import type { NormalizedRelease, ReleaseAdapter, ReleasePollResult, ReleaseSource, SourceCache } from './types.js';

export interface GitHubHttpClient {
  get(url: string, cache?: SourceCache): Promise<HttpReply>;
}

function field(record: Record<string, unknown>, name: string, max: number, nullable = false): string | null {
  const value = record[name];
  if (nullable && value === null) return null;
  if (typeof value !== 'string' || value.length > max) throw new Error(`Invalid GitHub release ${name}`);
  return value;
}

export function validateRepository(repository: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}\/[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(repository)) {
    throw new Error('Invalid GitHub repository');
  }
}

/** Uses the documented Releases API fields; tags alone are not treated as published releases. */
export function parseGitHubReleases(payload: unknown, repository: string, observedAt: Date): NormalizedRelease[] {
  validateRepository(repository);
  if (!Number.isFinite(observedAt.getTime())) throw new Error('Invalid observation timestamp');
  if (!Array.isArray(payload) || payload.length > 100) throw new Error('Invalid GitHub release list');
  const results: NormalizedRelease[] = [];
  for (const value of payload) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid GitHub release object');
    const record = value as Record<string, unknown>;
    if (typeof record.draft !== 'boolean' || typeof record.prerelease !== 'boolean') throw new Error('Invalid GitHub release channel');
    if (record.draft || record.prerelease) continue;
    if (!Number.isSafeInteger(record.id) || (record.id as number) < 1) throw new Error('Invalid GitHub release ID');
    const versionTag = field(record, 'tag_name', 256)!;
    if (!versionTag.trim()) throw new Error('Empty GitHub release tag');
    const title = field(record, 'name', 1000, true) || versionTag;
    const releaseUrl = field(record, 'html_url', 2048)!;
    const url = new URL(releaseUrl);
    if (url.origin !== 'https://github.com' || url.username || url.password || url.hash || url.search ||
        !url.pathname.toLowerCase().startsWith(`/${repository.toLowerCase()}/releases/tag/`)) {
      throw new Error('Invalid GitHub release URL');
    }
    const published = field(record, 'published_at', 50)!;
    const publishedAt = new Date(published);
    if (!/^\d{4}-\d{2}-\d{2}T/.test(published) || !Number.isFinite(publishedAt.getTime())) throw new Error('Invalid GitHub published date');
    const notesText = field(record, 'body', 262_144, true) ?? '';
    results.push({ sourceKey: `github-releases:${repository.toLowerCase()}`, guid: String(record.id), versionTag,
      title, releaseUrl: url.toString(), publishedAt, notesText, observedAt: new Date(observedAt) });
  }
  return results;
}

export class GitHubReleasesAdapter implements ReleaseAdapter {
  constructor(
    private readonly http: GitHubHttpClient = new SafeHttpClient({ allowedHosts: ['api.github.com'] }),
    private readonly now: () => Date = () => new Date(),
    private readonly maxPages = 5,
  ) {}

  async fetchReleases(source: ReleaseSource, cache: SourceCache = {}): Promise<ReleasePollResult> {
    if (source.kind !== 'github-releases' || source.channel !== 'stable') throw new Error('Unsupported release source');
    validateRepository(source.repository);
    if (!Number.isInteger(this.maxPages) || this.maxPages < 1 || this.maxPages > 10) throw new Error('Invalid release pagination bound');
    const observedAt = this.now();
    const releases: NormalizedRelease[] = [];
    let updatedCache: SourceCache = cache;
    for (let page = 1; page <= this.maxPages; page++) {
      const reply = await this.http.get(`https://api.github.com/repos/${source.repository}/releases?per_page=100&page=${page}`, page === 1 ? cache : {});
      if (page === 1) {
        updatedCache = { etag: reply.headers.etag ?? cache.etag, lastModified: reply.headers['last-modified'] ?? cache.lastModified };
        if (reply.status === 304) return { status: 'not-modified', cache: updatedCache };
      }
      if (reply.status !== 200) throw new Error(`GitHub release source HTTP ${reply.status}`);
      const payload: unknown = JSON.parse(reply.body);
      releases.push(...parseGitHubReleases(payload, source.repository, observedAt));
      if ((payload as unknown[]).length < 100) return { status: 'modified', cache: updatedCache, releases };
    }
    // Do not silently mark a source successful when its bounded history fetch was incomplete.
    throw new Error('GitHub release history exceeds pagination bound');
  }
}
