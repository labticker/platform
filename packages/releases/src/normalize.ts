import { createHash } from 'node:crypto';
import { parse, valid } from 'semver';
import type { NormalizedRelease, VersionScheme } from './types.js';

export function normalizeVersionTag(tag: string): string {
  const trimmed = tag.trim();
  const candidate = trimmed.replace(/^v(?=\d)/, '');
  return valid(candidate) ?? trimmed;
}

/** Versioning policy is supplied by a reviewed source mapping, never inferred from a numeric tag. */
export function majorVersionIncrement(previous: string | null, current: string | null, scheme: VersionScheme): boolean {
  if (scheme !== 'semver' || !previous || !current) return false;
  const before = parse(normalizeVersionTag(previous));
  const after = parse(normalizeVersionTag(current));
  // Four-digit years remain ambiguous even if syntactically valid semver.
  return !!before && !!after && !before.prerelease.length && !after.prerelease.length &&
    before.major < 2000 && after.major < 2000 && after.major > before.major;
}

/** Stable application-scoped provider identity; use a DB UNIQUE(application_id,dedupe_key). */
export function releaseDedupeKey(applicationId: string, release: Pick<NormalizedRelease, 'sourceKey' | 'guid' | 'releaseUrl' | 'versionTag'>): string {
  let identity: readonly string[];
  if (release.guid) {
    // GitHub release IDs are provider-wide, so repository renames cannot change identity.
    const namespace = release.sourceKey.startsWith('github-releases:') ? 'github-releases' : release.sourceKey;
    identity = ['guid', namespace, release.guid];
  }
  else if (release.releaseUrl) {
    const url = new URL(release.releaseUrl);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Invalid canonical release URL');
    url.hash = ''; url.search = '';
    identity = ['url', url.toString().replace(/\/$/, '')];
  } else if (release.versionTag?.trim()) identity = ['tag', normalizeVersionTag(release.versionTag)];
  else throw new Error('Release has no stable identity');
  return createHash('sha256').update(JSON.stringify([applicationId, ...identity])).digest('hex');
}

export interface PreparedRelease extends NormalizedRelease {
  readonly dedupeKey: string;
  readonly isBackfill: boolean;
}

/** Preparation does not mark a release delivered. Persistence must preserve first-seen/backfill on conflicts. */
export function prepareReleaseBatch(applicationId: string, releases: readonly NormalizedRelease[], initialPoll: boolean): PreparedRelease[] {
  const seen = new Set<string>();
  const prepared: PreparedRelease[] = [];
  for (const release of releases) {
    const dedupeKey = releaseDedupeKey(applicationId, release);
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    prepared.push({ ...release, dedupeKey, isBackfill: initialPoll });
  }
  return prepared;
}

export function eligibleForDigest(release: Pick<PreparedRelease, 'isBackfill' | 'observedAt'>, enabledAt: Date, windowEnd: Date): boolean {
  return !release.isBackfill && release.observedAt.getTime() > enabledAt.getTime() &&
    release.observedAt.getTime() <= windowEnd.getTime();
}
