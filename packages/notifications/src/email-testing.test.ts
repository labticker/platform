import {describe,it,expect} from 'vitest';
import {privateEmailTestPolicy,createPrivateEmailTestTransport} from './email-testing.js';
import {createEmailTransport,type ResendSendClient} from './resend.js';
export const config={ownerApproval:{decision:'private-email-test-approved',reference:'owner-private-test'},appUrl:'https://labticker.fly.dev',sender:{address:'labticker@example.com',domain:'example.com',status:'verified',evidenceReference:'verified-sender',checkedAt:'2026-01-01T00:00:00Z'},trackingReview:{reference:'untracked-domain',authOpenTracking:false,authClickTracking:false,digestOpenTracking:false,digestClickTracking:false},recipients:['owner@example.com'],senderIdentity:'LabTicker private test',senderContact:'Contact the project maintainer'};
const env={EMAIL_TEST_ENABLED:'true',OWNER_ACCEPTANCE_ONLY:'true',EMAIL_DELIVERY_MODE:'mock',PUBLIC_EMAIL_ENABLED:'false',APP_URL:config.appUrl,EMAIL_TEST_APPROVAL_JSON:JSON.stringify(config)};
describe('private email test capability',()=>{
 it('requires private approval, verified untracked sender and explicit approved recipients',()=>{
  expect(privateEmailTestPolicy(env).recipients).toEqual(['owner@example.com']);
  for(const patch of [{EMAIL_TEST_ENABLED:'false'},{OWNER_ACCEPTANCE_ONLY:'false'},{EMAIL_DELIVERY_MODE:'resend'},{PUBLIC_EMAIL_ENABLED:'true'},{EMAIL_AUTH_ENABLED:'true'},{EMAIL_TEST_APPROVAL_JSON:'{}'}])expect(()=>privateEmailTestPolicy({...env,...patch})).toThrow();
  for(const patch of [{recipients:[]},{recipients:['bad\r\n@example.com']},{sender:{...config.sender,domain:'labticker.fly.dev'}},{trackingReview:{...config.trackingReview,digestOpenTracking:true}}])expect(()=>privateEmailTestPolicy({...env,EMAIL_TEST_APPROVAL_JSON:JSON.stringify({...config,...patch})})).toThrow();
  expect(()=>createEmailTransport({...env,EMAIL_DELIVERY_MODE:'resend',PUBLIC_EMAIL_ENABLED:'true',EMAIL_ROLLOUT_APPROVAL_JSON:env.EMAIL_TEST_APPROVAL_JSON})).toThrow();
 });
 it('cannot send outside the allowlist or without a test-labelled immutable key',async()=>{
  let calls=0;const client:ResendSendClient={emails:{async send(){calls++;return {data:{id:'fixture-provider'},error:null};}}};
  const gateway=createPrivateEmailTestTransport(env,client),message={to:'outsider@example.com',subject:'[TEST] Digest',html:'<p>Private test</p>',text:'Private test',headers:{'List-Unsubscribe':'<https://labticker.fly.dev/unsubscribe?token=fixture.token>','List-Unsubscribe-Post':'List-Unsubscribe=One-Click'}};
  await expect(gateway.send(message,'email-test/fixture')).rejects.toThrow();
  await expect(gateway.send({...message,to:'owner@example.com',subject:'Digest'},'email-test/fixture')).rejects.toThrow();
  await expect(gateway.send({...message,to:'owner@example.com'},'digest/fixture')).rejects.toThrow();expect(calls).toBe(0);
  expect(await gateway.send({...message,to:'owner@example.com'},'email-test/fixture')).toEqual({id:'fixture-provider'});expect(calls).toBe(1);
 });
});
