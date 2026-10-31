export type EventName = '$pageview' | 'catalog_search_used' | 'catalog_filter_used' | 'monitor_toggle_clicked' | 'signup_started' | 'digest_preference_opened';
const events = new Set<string>(['$pageview','catalog_search_used','catalog_filter_used','monitor_toggle_clicked','signup_started','digest_preference_opened']);
const routes = new Set(['/','/apps','/dashboard','/settings','/privacy','/terms']);
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
  return {uuid:event.uuid,event:clean.event,...(event.timestamp?{timestamp:event.timestamp}:{}),properties:{...clean.properties,token:publicProjectKey,distinct_id:'$posthog_cookieless',$process_person_profile:false}};
}
export interface Analytics { capture(event:EventName, path:string):void; }
export const noopAnalytics: Analytics = Object.freeze({capture:()=>{}});
export interface AnalyticsConfig { provider:'noop'|'posthog'; production:boolean; optedOut:boolean; doNotTrack:boolean; key?:string; host?:string; }
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
  return {capture(event,path){const clean=safeEvent(event,path);if(clean) posthog.capture(clean.event,clean.properties);}};
}
