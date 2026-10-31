'use client';
import {useEffect} from 'react';
import {createAnalytics} from '@labticker/analytics';
export default function Analytics({enabled}:{enabled:boolean}) {
 useEffect(()=>{
  if(!enabled) return;
  void createAnalytics({provider:'posthog',production:process.env.NODE_ENV==='production',
   doNotTrack:navigator.doNotTrack==='1',optedOut:document.cookie.split(';').some(part=>part.trim()==='labticker_analytics=off'),
   key:process.env.NEXT_PUBLIC_POSTHOG_KEY,host:process.env.NEXT_PUBLIC_POSTHOG_HOST,
  }).then(adapter=>adapter.capture('$pageview',window.location.pathname)).catch(()=>{/* Measurement failure must not break the product. */});
 },[enabled]);
 return null;
}
