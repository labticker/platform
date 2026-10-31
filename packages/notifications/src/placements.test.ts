import { describe, expect, it, vi } from 'vitest';
import { renderEmailPlacement, websiteAds } from './placements.js';

describe('compiled MVP advertising policy', () => {
  it('cannot activate a website provider through environment credentials', () => {
    vi.stubEnv('ADS_ENABLED', 'true');
    vi.stubEnv('WEB_AD_PROVIDER', 'adsense');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    try {
      expect(websiteAds.render('public-app-detail')).toBeNull();
      expect(websiteAds.name).toBe('none');
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally { vi.unstubAllEnvs(); fetchSpy.mockRestore(); }
  });
  it.each(['authentication', 'digest', 'service'] as const)('omits malicious campaign content from %s', (messageKind) => {
    vi.stubEnv('EMAIL_SPONSORS_ENABLED', 'true');
    try {
      for (const releaseCount of [0, 1, 10]) {
        expect(renderEmailPlacement({ messageKind, releaseCount, campaigns: [{
          id: 'fixture', status: 'draft', kind: 'sponsor', headline: '<script>bad</script>',
          body: 'Sponsored', targetUrl: 'https://example.invalid/pixel',
        }] })).toBeNull();
      }
    } finally { vi.unstubAllEnvs(); }
  });
});
