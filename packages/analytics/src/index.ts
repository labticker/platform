export type EventName = '$pageview' | 'catalog_search_used' | 'catalog_filter_used' | 'monitor_toggle_clicked' | 'signup_started' | 'digest_preference_opened' | 'release_notes_link_clicked';
const events = new Set<string>(['$pageview','catalog_search_used','catalog_filter_used','monitor_toggle_clicked','signup_started','digest_preference_opened','release_notes_link_clicked']);
const routes = new Set(['/','/apps','/apps/[slug]','/dashboard','/settings','/privacy','/terms']);
export type AcquisitionCategory='direct'|'internal'|'search'|'community'|'social'|'email'|'campaign'|'other';
const acquisitionCategories=new Set<unknown>(['direct','internal','search','community','social','email','campaign','other']);
const marketingRoutes=new Set(['/','/apps','/apps/[slug]']);
/** Return one coarse enum only. URLs, query/referrer values and campaign strings never leave this boundary. */
export function safeAcquisition(currentUrl:string,referrer:string):AcquisitionCategory{
 if(currentUrl.length>4096||referrer.length>4096)return 'other';
 try{
  const current=new URL(currentUrl);
  if(!['https:','http:'].includes(current.protocol)||current.username||current.password)return 'other';
  const source=current.searchParams.get('utm_source'),medium=current.searchParams.get('utm_medium');
  if(source!==null||medium!==null){
   if(current.searchParams.getAll('utm_source').length>1||current.searchParams.getAll('utm_medium').length>1||(source?.length??0)>32||(medium?.length??0)>32)return 'other';
   const sources:Record<string,AcquisitionCategory>={google:'search',bing:'search',duckduckgo:'search',reddit:'community',github:'community',hackernews:'community',mastodon:'social',twitter:'social',x:'social',bluesky:'social',newsletter:'email',launch:'campaign'};
   const media:Record<string,AcquisitionCategory>={email:'email',social:'social',organic:'search',cpc:'campaign',paid:'campaign',display:'campaign'};
   const get=(map:Record<string,AcquisitionCategory>,value:string|null)=>value&&Object.hasOwn(map,value.toLowerCase())?map[value.toLowerCase()]:undefined;
   return get(media,medium)??get(sources,source)??'other';
  }
  if(!referrer)return 'direct';
  const previous=new URL(referrer);
  if(!['https:','http:'].includes(previous.protocol)||previous.username||previous.password)return 'other';
  if(previous.origin===current.origin)return 'internal';
  const hosts:Record<string,AcquisitionCategory>={'google.com':'search','www.google.com':'search','bing.com':'search','www.bing.com':'search','duckduckgo.com':'search','search.brave.com':'search','reddit.com':'community','www.reddit.com':'community','github.com':'community','news.ycombinator.com':'community','twitter.com':'social','x.com':'social','bsky.app':'social'};
  return Object.hasOwn(hosts,previous.hostname)?hosts[previous.hostname]!:'other';
 }catch{return 'other';}
}
export function safeRoute(path: string): string | null {
  const pathname = path.split(/[?#]/)[0] ?? '';
  if(routes.has(pathname)) return pathname;
  if(/^\/apps\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(pathname)) return '/apps/[slug]';
  return null;
}
export function safeEvent(event:string, path:string):{event:EventName;properties:{route:string}} | null {
  const route = safeRoute(path);
  return events.has(event) && route ? {event:event as EventName,properties:{route}} : null;
}
/** Preserve only the SDK envelope and public project routing token. Person updates,
 * URL/referrer/device enrichment and caller-supplied tokens must never pass through.
 */
export function sanitizeTransportEvent(event:{uuid:string;event:string;properties:Record<string,unknown>;timestamp?:Date},publicProjectKey:string){
  const clean=safeEvent(event.event,String(event.properties.route??''));
  if(!clean||!publicProjectKey)return null;
  const acquisition=clean.event==='$pageview'&&marketingRoutes.has(clean.properties.route)&&acquisitionCategories.has(event.properties.acquisition)?event.properties.acquisition as AcquisitionCategory:undefined;
  return {uuid:event.uuid,event:clean.event,...(event.timestamp?{timestamp:event.timestamp}:{}),properties:{...clean.properties,...(acquisition?{acquisition}:{}),token:publicProjectKey,distinct_id:'$posthog_cookieless',$process_person_profile:false}};
}
export interface Analytics { capture(event:EventName, path:string):void; }
export const noopAnalytics: Analytics = Object.freeze({capture:()=>{}});
export interface AnalyticsConfig { provider:'noop'|'posthog'; production:boolean; optedOut:boolean; doNotTrack:boolean; key?:string; host?:string; acquisition?:AcquisitionCategory; }
export async function createAnalytics(config:AnalyticsConfig):Promise<Analytics> {
  if(config.provider!=='posthog'||!config.production||config.optedOut||config.doNotTrack||!config.key) return noopAnalytics;
  if(!['https://us.i.posthog.com','https://eu.i.posthog.com'].includes(config.host??'')) throw new Error('Unapproved analytics host');
  const {posthog} = await import('posthog-js');
  posthog.init(config.key, {
    api_host:config.host, cookieless_mode:'always', person_profiles:'never', autocapture:false,
    capture_pageview:false,capture_pageleave:false,disable_session_recording:true,
    disable_surveys:true,advanced_disable_feature_flags:true,disable_external_dependency_loading:true,
    before_send:(event)=> {
      if(!event) return null;
      return sanitizeTransportEvent(event,config.key!);
    },
  });
  return {capture(event,path){const clean=safeEvent(event,path);if(clean) posthog.capture(clean.event,{...clean.properties,...(event==='$pageview'&&marketingRoutes.has(clean.properties.route)&&acquisitionCategories.has(config.acquisition)?{acquisition:config.acquisition}:{})});}};
}
