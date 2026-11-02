import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement,type ComponentProps} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {EmailTestPanel} from '../app/digests/email-test-panel';
import {privateEmailTestVisible,emailTestMessage} from '../lib/email-testing';
test('private real email test controls fail closed outside owner mock mode',()=>{
 const env={EMAIL_TEST_ENABLED:'true',OWNER_ACCEPTANCE_ONLY:'true',EMAIL_DELIVERY_MODE:'mock'};
 assert.equal(privateEmailTestVisible(env,{role:'admin'}),true);
 for(const patch of [{EMAIL_TEST_ENABLED:undefined},{EMAIL_TEST_ENABLED:'false'},{OWNER_ACCEPTANCE_ONLY:'false'},{EMAIL_DELIVERY_MODE:'resend'},{EMAIL_DELIVERY_MODE:undefined}])assert.equal(privateEmailTestVisible({...env,...patch},{role:'admin'}),false);
 assert.equal(privateEmailTestVisible(env,{role:'user'}),false);
 assert.equal(privateEmailTestVisible(env,null),false);
});
test('email test status displays only fixed safe messages',()=>{
 assert.match(emailTestMessage('queued')!,/not delivery/);
 for(const value of ['toString','__proto__','private@example.invalid',['queued'],undefined])assert.equal(emailTestMessage(value),undefined);
});
test('test form requires fresh separate consent and offers no recipient override',()=>{
 const render=()=>renderToStaticMarkup(createElement(EmailTestPanel,{action:async()=>{},status:'queued'}));
 const first=render(),second=render();
 assert.match(first,/<input(?=[^>]*name="testConsent")(?=[^>]*required="")[^>]*>/);
 assert.doesNotMatch(first,/checked=""|type="email"|name="(?:recipient|email|userId)"/);
 assert.match(first,/Send a test digest to my verified account email/);
 const requestId=(html:string)=>html.match(/name="requestId" value="([a-f0-9-]+)"/)?.[1];
 assert.match(requestId(first)!,/^[a-f0-9-]{36}$/);
 assert.notEqual(requestId(first),requestId(second));
 assert.match(first,/role="status"/);
});
test('private test history distinguishes acceptance from delivery and reports bounces',()=>{
 type Entry=NonNullable<ComponentProps<typeof EmailTestPanel>['history']>[number];
 const base:Entry={id:'fixture',status:'sent',createdAt:new Date('2026-11-02T12:00:00Z'),sentAt:new Date(),deliveredAt:null,bouncedAt:null,complainedAt:null};
 const render=(entry:Entry)=>renderToStaticMarkup(createElement(EmailTestPanel,{action:async()=>{},history:[entry]}));
 assert.match(render(base),/UTC · Accepted by email provider/);
 assert.match(render({...base,deliveredAt:new Date()}),/UTC · Delivered/);
 assert.match(render({...base,deliveredAt:new Date(),bouncedAt:new Date()}),/UTC · Bounced/);
 assert.match(render({...base,complainedAt:new Date()}),/UTC · Complaint received/);
});
