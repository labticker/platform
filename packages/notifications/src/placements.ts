/** MVP policy is compiled in. Environment flags and campaign data cannot activate ads.
 * A future monetization implementation requires a reviewed code change after owner approval.
 */
export type WebsiteAdPlacement = 'public-app-detail';
export interface WebsiteAdProvider {
  readonly name: 'none';
  render(placement: WebsiteAdPlacement): null;
}
export const websiteAds: WebsiteAdProvider = Object.freeze({
  name: 'none',
  render: (_placement: WebsiteAdPlacement): null => null,
});

export interface DraftEmailCampaign {
  readonly id: string;
  readonly status: 'draft';
  readonly kind: 'sponsor' | 'affiliate';
  readonly headline: string;
  readonly body: string;
  readonly targetUrl: string;
}
export interface EmailPlacementContext {
  readonly messageKind: 'authentication' | 'digest' | 'service';
  readonly releaseCount: number;
  readonly campaigns: readonly DraftEmailCampaign[];
}
/** Zero placements throughout MVP/beta, including authentication and empty digests. */
export function renderEmailPlacement(_context: EmailPlacementContext): null {
  return null;
}
