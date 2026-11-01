import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAnalytics,noopAnalytics,safeEvent,safeRoute,sanitizeTransportEvent,safeAcquisition} from '../src/index.js';
test('token queries and app identifiers never leave route sanitizer',()=>{
 assert.deepEqual(safeEvent('$pageview','/apps/immich?email=private@example.com#token'),{event:'$pageview',properties:{route:'/apps/[slug]'}});
 for(const path of ['/auth/callback?token=secret','/unsubscribe?token=secret','/admin/users/123','/apps/private@example.com']) assert.equal(safeRoute(path),null);
 assert.equal(safeEvent('identify','/'),null);
 assert.deepEqual(safeEvent('release_notes_link_clicked','/apps/immich?subscriber=private'),{event:'release_notes_link_clicked',properties:{route:'/apps/[slug]'}});
});
test('disabled, DNT and opt-out modes never initialize vendor SDK',async()=>{
 for(const config of [{production:false,optedOut:false,doNotTrack:false},{production:true,optedOut:true,doNotTrack:false},{production:true,optedOut:false,doNotTrack:true}]){
   assert.equal(await createAnalytics({provider:'posthog',key:'fixture',host:'https://untrusted.invalid',...config}),noopAnalytics);
 }
});
test('transport retains public project routing without person updates or identifying properties',()=>{
 const input={uuid:'fixture-event',event:'$pageview',properties:{route:'/apps/immich?email=private@example.com',token:'untrusted',email:'private@example.com',$current_url:'https://example.com/?token=secret',$referrer:'https://example.com/private'},$set:{email:'private@example.com'},$set_once:{user_id:'private-id'}};
 assert.deepEqual(sanitizeTransportEvent(input,'public-fixture-project'),{uuid:'fixture-event',event:'$pageview',properties:{route:'/apps/[slug]',token:'public-fixture-project',distinct_id:'$posthog_cookieless',$process_person_profile:false,$geoip_disable:true}});
 assert.equal(sanitizeTransportEvent({...input,event:'$identify'},'public-fixture-project'),null);
});
test('app-detail template survives adapter and transport double sanitization',()=>{
 const capture=safeEvent('$pageview','/apps/immich?token=private');assert.ok(capture);
 const transport=sanitizeTransportEvent({uuid:'fixture-double-pass',...capture},'public-fixture-project');
 assert.equal(transport?.properties.route,'/apps/[slug]');
});
test('acquisition emits coarse enums only, regardless of private queries or referrer paths',()=>{
 assert.equal(safeAcquisition('https://example.com/?email=private@example.invalid&token=private',''),'direct');
 assert.equal(safeAcquisition('https://example.com/','https://example.com/private?token=private'),'internal');
 assert.equal(safeAcquisition('https://example.com/','https://www.google.com/search?q=private@example.invalid'),'search');
 assert.equal(safeAcquisition('https://example.com/?utm_source=reddit&utm_campaign=private@example.invalid',''),'community');
 assert.equal(safeAcquisition('https://example.com/?utm_medium=email&email=private@example.invalid',''),'email');
 assert.equal(safeAcquisition('https://example.com/?utm_medium=cpc',''),'campaign');
 assert.equal(safeAcquisition('https://example.com/?utm_source=__proto__',''),'other');
 assert.equal(safeAcquisition('https://example.com/?utm_medium=constructor',''),'other');
 for(const [url,referrer] of [['https://user:pass@example.com/',''],['javascript:private',''],['https://example.com/?utm_source=private@example.invalid',''],['https://example.com/?utm_source=reddit&utm_source=google',''],['https://example.com/','https://private:pass@reddit.com/'],['https://example.com/','https://google.com.evil.invalid/private'],['https://example.com/'+ 'x'.repeat(5000),'']])assert.equal(safeAcquisition(url!,referrer!),'other');
});
test('only public marketing pageviews retain allowlisted acquisition categories',()=>{
 const base={uuid:'fixture-acquisition',event:'$pageview',properties:{route:'/apps/[slug]',acquisition:'community'}};
 assert.equal(sanitizeTransportEvent(base,'public-fixture')?.properties.acquisition,'community');
 assert.equal(sanitizeTransportEvent({...base,properties:{...base.properties,acquisition:'private@example.invalid'}},'public-fixture')?.properties.acquisition,undefined);
 for(const route of ['/dashboard','/settings','/privacy'])assert.equal(sanitizeTransportEvent({...base,properties:{...base.properties,route}},'public-fixture')?.properties.acquisition,undefined);
 assert.equal(sanitizeTransportEvent({...base,event:'monitor_toggle_clicked'},'public-fixture')?.properties.acquisition,undefined);
});
