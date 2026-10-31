import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAnalytics,noopAnalytics,safeEvent,safeRoute,sanitizeTransportEvent} from '../src/index.js';
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
test('transport retains public project routing without person updates or identifying properties',()=>{
 const input={uuid:'fixture-event',event:'$pageview',properties:{route:'/apps/immich?email=private@example.com',token:'untrusted',email:'private@example.com',$current_url:'https://example.com/?token=secret',$referrer:'https://example.com/private'},$set:{email:'private@example.com'},$set_once:{user_id:'private-id'}};
 assert.deepEqual(sanitizeTransportEvent(input,'public-fixture-project'),{uuid:'fixture-event',event:'$pageview',properties:{route:'/apps/[slug]',token:'public-fixture-project',distinct_id:'$posthog_cookieless',$process_person_profile:false}});
 assert.equal(sanitizeTransportEvent({...input,event:'$identify'},'public-fixture-project'),null);
});
