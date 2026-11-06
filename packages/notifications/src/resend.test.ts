import {describe,it,expect,vi} from 'vitest';
import {ResendDigestGateway,ResendAuthenticationGateway,createResendDigestGateway,createEmailTransport,createAuthenticationEmailTransport,assertApprovedResendPolicy,approvedResendRecipients,EmailDeliveryError,type ResendDigestApproval,type ResendSendClient} from './resend.js';
import {MockEmailGateway} from './core.js';
import type {EmailMessage} from './core.js';
const now=new Date('2026-10-31T00:00:00Z');
const approval=():ResendDigestApproval=>({mode:'resend',publicEmailEnabled:true,ownerApproval:{decision:'live-email-approved',reference:'fixture/owner-approval'},sender:{address:'updates@updates.example.org',domain:'updates.example.org',status:'verified',evidenceReference:'fixture/verified-domain',checkedAt:'2026-10-30T00:00:00Z'},authenticationDomain:'auth.example.org',trackingReview:{reference:'fixture/tracking-review',authOpenTracking:false,authClickTracking:false,digestOpenTracking:false,digestClickTracking:false},appUrl:'https://web.example.org'});
const message=():EmailMessage=>({to:'fixture@example.com',subject:'LabTicker updates',html:'<p>New software release</p>',text:'New software release',headers:{'List-Unsubscribe':'<https://web.example.org/unsubscribe?token=fixture>','List-Unsubscribe-Post':'List-Unsubscribe=One-Click'}});
const client=()=>({emails:{send:vi.fn<ResendSendClient['emails']['send']>().mockResolvedValue({data:{id:'provider-fixture'},error:null})}});
describe('dormant Resend digest gateway',()=>{
 it('credentials or public flag alone never activate the boundary',()=>{
  expect(()=>createResendDigestGateway({},'fixture-key')).toThrow('approval');
  for(const config of [{...approval(),mode:'mock' as const},{...approval(),publicEmailEnabled:false},{...approval(),ownerApproval:undefined},{...approval(),trackingReview:undefined},{...approval(),sender:undefined}])expect(()=>new ResendDigestGateway(config,client(),now)).toThrow();
 });
 it('rejects fly.dev senders and tracking activation while allowing OAuth-only or shared untracked domains',()=>{
  const base=approval();
  expect(()=>new ResendDigestGateway({...base,sender:{...base.sender!,address:'updates@labticker.fly.dev',domain:'labticker.fly.dev'}},client(),now)).toThrow();
  expect(()=>new ResendDigestGateway({...base,authenticationDomain:base.sender!.domain},client(),now)).not.toThrow();
  expect(()=>new ResendDigestGateway({...base,authenticationDomain:undefined},client(),now)).not.toThrow();
  expect(()=>new ResendDigestGateway({...base,trackingReview:{...base.trackingReview!,authOpenTracking:true} as unknown as NonNullable<ResendDigestApproval['trackingReview']>},client(),now)).toThrow();
 });
 it('runtime factory stays mock by default and requires a bound nonforgeable live rollout capability',()=>{
  expect(createEmailTransport({RESEND_API_KEY:'fixture-key'}).gateway).toBeInstanceOf(MockEmailGateway);
  expect(()=>createEmailTransport({EMAIL_DELIVERY_MODE:'resend',PUBLIC_EMAIL_ENABLED:'true',RESEND_API_KEY:'fixture-key'})).toThrow('approval');
  const sdk=client(),gateway=new ResendDigestGateway(approval(),sdk,now);
  expect(()=>assertApprovedResendPolicy({},'https://web.example.org',gateway)).toThrow();
  expect(()=>assertApprovedResendPolicy(gateway.approval,'https://different.example.org',gateway)).toThrow();
  expect(()=>assertApprovedResendPolicy(gateway.approval,'https://web.example.org',new MockEmailGateway())).toThrow();
  expect(()=>assertApprovedResendPolicy(gateway.approval,'https://web.example.org',gateway)).not.toThrow();
  const transport=createEmailTransport({EMAIL_DELIVERY_MODE:'resend',PUBLIC_EMAIL_ENABLED:'true',APP_URL:'https://web.example.org',RESEND_API_KEY:'fixture-key',EMAIL_ROLLOUT_APPROVAL_JSON:JSON.stringify({...approval(),authenticationDomain:undefined})});
  expect(transport.mode).toBe('resend');expect(transport.liveApproval).toBeDefined();expect(sdk.emails.send).not.toHaveBeenCalled();
 });
 it('passes the persisted payload and exact idempotency key without vendor lookups',async()=>{
  const sdk=client(),gateway=new ResendDigestGateway(approval(),sdk,now),mail=message();
  expect(await gateway.send(mail,'digest/fixture-id')).toEqual({id:'provider-fixture'});
  expect(sdk.emails.send).toHaveBeenCalledExactlyOnceWith({from:'updates@updates.example.org',to:[mail.to],subject:mail.subject,html:mail.html,text:mail.text,headers:mail.headers},{idempotencyKey:'digest/fixture-id',signal:expect.any(AbortSignal)});
 });
 it('binds an immutable singleton owner audience and blocks other recipients before SDK calls',async()=>{
  const recipients=['fixture@example.com'];
  const sdk=client(),config:ResendDigestApproval={...approval(),publicEmailEnabled:false,audience:{kind:'owner-only',recipients}},gateway=new ResendDigestGateway(config,sdk,now);
  recipients[0]='outsider@example.com';
  expect(approvedResendRecipients(gateway.approval,'https://web.example.org')).toEqual(['fixture@example.com']);
  expect(Object.isFrozen(approvedResendRecipients(gateway.approval,'https://web.example.org'))).toBe(true);
  expect(()=>approvedResendRecipients({},'https://web.example.org')).toThrow('Approved');
  expect(()=>approvedResendRecipients(gateway.approval,'https://other.example.org')).toThrow('Approved');
  await expect(gateway.send({...message(),to:'outsider@example.com'},'digest/outsider')).rejects.toMatchObject({disposition:'permanent'});
  expect(sdk.emails.send).not.toHaveBeenCalled();
  await expect(gateway.send({...message(),to:'Fixture@example.com'},'digest/owner')).resolves.toEqual({id:'provider-fixture'});
  expect(sdk.emails.send).toHaveBeenCalledTimes(1);
  expect(approvedResendRecipients(new ResendDigestGateway(approval(),client(),now).approval,'https://web.example.org')).toBeUndefined();
 });
 it('rejects incomplete, noncanonical or widened owner audiences',()=>{
  const base={...approval(),publicEmailEnabled:false};
  for(const recipients of [[],['fixture@example.com','other@example.com'],['Fixture@example.com'],[' fixture@example.com'],['fixture@example.com\r\nBcc: other@example.com'],['not-a-mailbox']]){
   expect(()=>new ResendDigestGateway({...base,audience:{kind:'owner-only',recipients}},client(),now)).toThrow();
  }
  expect(()=>new ResendDigestGateway({...base,audience:{kind:'public',recipients:['fixture@example.com']} as unknown as ResendDigestApproval['audience']},client(),now)).toThrow();
  expect(()=>new ResendDigestGateway({...approval(),audience:{kind:'owner-only',recipients:['fixture@example.com']}},client(),now)).toThrow();
  expect(()=>new ResendDigestGateway({...base,audience:{kind:'owner-only',recipients:['fixture@example.com']},ownerApproval:undefined},client(),now)).toThrow();
 });
 it('requires explicit owner flags and live approval while keeping public enrollment and auth closed',()=>{
  const config:ResendDigestApproval={...approval(),publicEmailEnabled:false,audience:{kind:'owner-only',recipients:['fixture@example.com']}};
  const env={EMAIL_DELIVERY_MODE:'resend',PUBLIC_EMAIL_ENABLED:'false',OWNER_ACCEPTANCE_ONLY:'true',EMAIL_AUTH_ENABLED:'false',APP_URL:'https://web.example.org',RESEND_API_KEY:'fixture-key',EMAIL_ROLLOUT_APPROVAL_JSON:JSON.stringify(config)};
  const transport=createEmailTransport(env);
  expect(transport.mode).toBe('resend');expect(transport.publicEmailEnabled).toBe(false);
  expect(approvedResendRecipients(transport.liveApproval,env.APP_URL)).toEqual(['fixture@example.com']);
  for(const patch of [{OWNER_ACCEPTANCE_ONLY:'false'},{OWNER_ACCEPTANCE_ONLY:undefined},{PUBLIC_EMAIL_ENABLED:undefined},{PUBLIC_EMAIL_ENABLED:'true'},{EMAIL_AUTH_ENABLED:'true'},{EMAIL_ROLLOUT_APPROVAL_JSON:undefined},{EMAIL_ROLLOUT_APPROVAL_JSON:JSON.stringify({...config,audience:undefined})},{APP_URL:'https://other.example.org'}])expect(()=>createEmailTransport({...env,...patch})).toThrow();
  expect(()=>createEmailTransport({...env,EMAIL_ROLLOUT_APPROVAL_JSON:undefined,EMAIL_TEST_APPROVAL_JSON:JSON.stringify(config)})).toThrow();
  expect(()=>createAuthenticationEmailTransport({...env,EMAIL_AUTH_ENABLED:'true'})).toThrow();
  expect(()=>new ResendAuthenticationGateway(config,client())).toThrow('public');
 });
 it('rejects header/recipient injection, tracking markup and invalid unsubscribe before dispatch',async()=>{
  const sdk=client(),gateway=new ResendDigestGateway(approval(),sdk,now);
  for(const mail of [{...message(),to:'a@example.com\r\nBcc: bad@example.com'},{...message(),html:'<img src="https://track.example.org/pixel">'},{...message(),headers:{...message().headers,'X-Injected':'value'}},{...message(),headers:{...message().headers,'List-Unsubscribe':'<https://evil.example.org/unsubscribe?token=x>'}},{...message(),headers:{...message().headers,'List-Unsubscribe':'<https://web.example.org/unsubscribe?token=x>,<https://evil.example.org>'}}])await expect(gateway.send(mail,'digest/fixture-id')).rejects.toMatchObject({disposition:'permanent'});
  expect(sdk.emails.send).not.toHaveBeenCalled();
 });
 it('normalizes retryable, permanent and ambiguous responses without provider text',async()=>{
  for(const [error,disposition] of [[{statusCode:429,name:'rate_limit_exceeded'},'retryable'],[{statusCode:409,name:'concurrent_idempotent_requests'},'retryable'],[{statusCode:422,name:'validation_error'},'permanent'],[{statusCode:500,name:'internal_server_error'},'ambiguous']] as const){
   const sdk=client();sdk.emails.send.mockResolvedValue({data:null,error});
   await expect(new ResendDigestGateway(approval(),sdk,now).send(message(),'digest/fixture-id')).rejects.toMatchObject({disposition,message:`Email delivery ${disposition}`});
  }
  const sdk=client();sdk.emails.send.mockRejectedValue(new Error('provider body containing private recipient'));
  try{await new ResendDigestGateway(approval(),sdk,now).send(message(),'digest/fixture-id');throw new Error('Expected failure');}catch(error){expect(error).toBeInstanceOf(EmailDeliveryError);expect(String(error)).not.toContain('recipient');expect((error as Error).cause).toBeUndefined();}
 });
 it('aborts bounded requests and treats timeout as unknown acceptance without leaking cause',async()=>{
  const sdk=client();
  sdk.emails.send.mockImplementation((_input,options)=>new Promise((_resolve,reject)=>{options.signal!.addEventListener('abort',()=>reject(new Error('Private provider timeout body')),{once:true});}));
  const gateway=new ResendDigestGateway({...approval(),requestTimeoutMs:100},sdk,now);
  await expect(gateway.send(message(),'digest/timeout-fixture')).rejects.toMatchObject({disposition:'ambiguous',message:'Email delivery ambiguous'});
  expect(()=>new ResendDigestGateway({...approval(),requestTimeoutMs:30001},sdk,now)).toThrow('timeout');
 });
});
