import {websiteAds,type WebsiteAdPlacement} from '@labticker/notifications/placements';
/** Compiled no-op during MVP: no element, vendor script, placeholder or network call. */
export function WebsiteAdSlot({placement}:{placement:WebsiteAdPlacement}){return websiteAds.render(placement);}
