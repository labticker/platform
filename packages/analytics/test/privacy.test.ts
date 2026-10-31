import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAnalytics,noopAnalytics,safeEvent,safeRoute} from '../src/index.js';
test('token queries and app identifiers never leave route sanitizer',()=>{
 assert.deepEqual(safeEvent('$pageview','/apps/immich?email=private@example.com#token'),{event:'$pageview',properties:{route:'/apps/[slug]'}});
 for(const path of ['/auth/callback?token=secret','/unsubscribe?token=secret','/admin/users/123','/apps/private@example.com']) assert.equal(safeRoute(path),null);
 assert.equal(safeEvent('identify','/'),null);
});
test('disabled, DNT and opt-out modes never initialize vendor SDK',async()=>{
 for(const config of [{production:false,optedOut:false,doNotTrack:false},{production:true,optedOut:true,doNotTrack:false},{production:true,optedOut:false,doNotTrack:true}]){
   assert.equal(await createAnalytics({provider:'posthog',key:'fixture',host:'https://untrusted.invalid',...config}),noopAnalytics);
 }
});
