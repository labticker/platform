export type VersionScheme = 'semver' | 'calver' | 'unknown';

export interface ReleaseSource {
  readonly kind: 'github-releases';
  readonly repository: string;
  readonly channel: 'stable';
}

export interface NormalizedRelease {
  readonly sourceKey: string;
  readonly guid: string | null;
  readonly versionTag: string | null;
  readonly title: string;
  readonly releaseUrl: string;
  readonly publishedAt: Date | null;
  readonly notesText: string;
  readonly observedAt: Date;
}

export interface SourceCache {
  readonly etag?: string;
  readonly lastModified?: string;
}

export type ReleasePollResult =
  | { readonly status: 'not-modified'; readonly cache: SourceCache }
  | { readonly status: 'modified'; readonly cache: SourceCache; readonly releases: readonly NormalizedRelease[] };

export interface ReleaseAdapter {
  fetchReleases(source: ReleaseSource, cache?: SourceCache): Promise<ReleasePollResult>;
}
