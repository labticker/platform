'use client';
import {useEffect} from 'react';
import {usePathname} from 'next/navigation';
import {createAnalytics,noopAnalytics,safeRoute,safeAcquisition} from '@labticker/analytics';
import type {Analytics as AnalyticsAdapter,EventName} from '@labticker/analytics';
let adapter:AnalyticsAdapter=noopAnalytics;
let initialization:Promise<AnalyticsAdapter>|undefined;
let lastPath:string|undefined;
function optedOut(){return navigator.doNotTrack==='1'||document.cookie.split(';').some(part=>part.trim()==='labticker_analytics=off');}
/** Deliberately accepts only an event name: form values, IDs and typed search never enter analytics. */
export function captureUiEvent(event:Exclude<EventName,'$pageview'>){
 if(typeof window==='undefined'||optedOut())return;
 adapter.capture(event,window.location.pathname);
}
export default function Analytics({enabled}:{enabled:boolean}) {
 const pathname=usePathname();
 useEffect(()=>{
  if(!enabled){adapter=noopAnalytics;return;}
  if(!pathname||!safeRoute(pathname)||optedOut())return;
  initialization??=createAnalytics({provider:'posthog',production:process.env.NODE_ENV==='production',
   doNotTrack:navigator.doNotTrack==='1',optedOut:optedOut(),
   key:process.env.NEXT_PUBLIC_POSTHOG_KEY,host:process.env.NEXT_PUBLIC_POSTHOG_HOST,
   acquisition:safeAcquisition(window.location.href,document.referrer),
  }).catch(()=>noopAnalytics);
  let cancelled=false;
  void initialization.then(value=>{
   if(cancelled||optedOut())return;
   adapter=value;
   if(lastPath===pathname)return;
   lastPath=pathname;
   if(safeRoute(pathname))adapter.capture('$pageview',pathname);
  });
  return ()=>{cancelled=true;};
 },[enabled,pathname]);
 return null;
}
