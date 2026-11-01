import {it,expect,vi} from 'vitest';
import {ResendAuthenticationGateway,createAuthenticationEmailTransport,type ResendDigestApproval,type ResendSendClient} from './resend.js';
const approval:ResendDigestApproval={mode:'resend',publicEmailEnabled:true,ownerApproval:{decision:'live-email-approved',reference:'fixture/owner'},sender:{address:'updates@example.org',domain:'example.org',status:'verified',checkedAt:'2026-10-30',evidenceReference:'fixture/sender'},trackingReview:{reference:'fixture/privacy',authOpenTracking:false,authClickTracking:false,digestOpenTracking:false,digestClickTracking:false},appUrl:'https://fixture.fly.dev'};
it('authentication transport is off by default and cannot activate with a key alone',()=>{
 expect(()=>createAuthenticationEmailTransport({RESEND_API_KEY:'fixture'})).toThrow('rollout');
 expect(()=>createAuthenticationEmailTransport({EMAIL_AUTH_ENABLED:'true',RESEND_API_KEY:'fixture'})).toThrow();
 expect(()=>new ResendAuthenticationGateway({...approval,trackingReview:undefined},{emails:{send:vi.fn()}})).toThrow();
});
it('auth email is bounded, idempotent, canonical and contains no tracking/sponsor/unsubscribe content',async()=>{
 const send=vi.fn<ResendSendClient['emails']['send']>().mockResolvedValue({data:{id:'auth-fixture-id'},error:null});
 const gateway=new ResendAuthenticationGateway(approval,{emails:{send}}),link='https://fixture.fly.dev/api/auth/callback/resend-email?token=fixture&email=fixture%40example.invalid';
 expect(await gateway.send('fixture@example.invalid',link)).toEqual({id:'auth-fixture-id'});
 await gateway.send('fixture@example.invalid',link);
 const [mail,options]=send.mock.calls[0]!;
 expect(options.idempotencyKey).toMatch(/^auth\/[a-f0-9]{64}$/);expect(options.idempotencyKey).toBe(send.mock.calls[1]?.[1].idempotencyKey);expect(options.signal).toBeInstanceOf(AbortSignal);
 expect(mail.html).not.toMatch(/<img|sponsor|affiliate|unsubscribe|adsense|carbon/i);expect(mail.headers).toBeUndefined();
 await expect(gateway.send('fixture@example.invalid','https://evil.example/api/auth/callback/resend-email?token=fixture')).rejects.toThrow();
 await expect(gateway.send('fixture@example.invalid','https://fixture.fly.dev/unsubscribe?token=fixture')).rejects.toThrow();
 expect(send).toHaveBeenCalledTimes(2);
});
