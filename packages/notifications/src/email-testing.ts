import {Resend} from 'resend';
import {appOrigin,type EmailGateway} from './core.js';
import {ResendDigestGateway,type ResendDigestApproval,type ResendSendClient} from './resend.js';
type Env=Record<string,string|undefined>;
interface PrivateTestApproval{
 ownerApproval:{decision:'private-email-test-approved';reference:string};appUrl:string;
 sender:NonNullable<ResendDigestApproval['sender']>;trackingReview:NonNullable<ResendDigestApproval['trackingReview']>;
 recipients:readonly string[];senderIdentity:string;senderContact:string;
 replyTo?:string;
}
function parsedPolicy(env:Env){
 if(env.EMAIL_TEST_ENABLED!=='true'||env.OWNER_ACCEPTANCE_ONLY!=='true'||env.EMAIL_DELIVERY_MODE!=='mock'||env.PUBLIC_EMAIL_ENABLED==='true'||env.EMAIL_AUTH_ENABLED==='true')throw new Error('Private email testing disabled');
 let config:PrivateTestApproval;try{config=JSON.parse(env.EMAIL_TEST_APPROVAL_JSON??'');}catch{throw new Error('Private email test approval required');}
 if(!config||config.ownerApproval?.decision!=='private-email-test-approved'||config.appUrl!==env.APP_URL)throw new Error('Private email test approval required');
 const origin=appOrigin(config.appUrl);
 if(!Array.isArray(config.recipients)||!config.recipients.length||config.recipients.length>5)throw new Error('Approved test recipients required');
 const recipients=config.recipients.map(value=>{if(typeof value!=='string'||value.length>254||!/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+$/.test(value))throw new Error('Invalid approved test recipient');return value.toLowerCase();});
 if(new Set(recipients).size!==recipients.length)throw new Error('Duplicate approved test recipient');
 for(const value of [config.senderIdentity,config.senderContact])if(typeof value!=='string'||!value.trim()||value.length>500||/[\x00-\x1f\x7f]/.test(value))throw new Error('Approved test sender identity required');
 // Validate the same sender/tracking evidence as real digests without creating a network client.
 const senderConfig:ResendDigestApproval={mode:'resend',publicEmailEnabled:true,ownerApproval:{decision:'live-email-approved',reference:config.ownerApproval.reference},sender:config.sender,trackingReview:config.trackingReview,appUrl:origin,...(config.replyTo?{replyTo:config.replyTo}:{})};
 const neverSend:ResendSendClient={emails:{async send(){throw new Error('Policy validation cannot send');}}};
 new ResendDigestGateway(senderConfig,neverSend);
 return {recipients:Object.freeze(recipients),senderIdentity:config.senderIdentity,senderContact:config.senderContact,origin,senderConfig};
}
/** The test approval cannot activate public digest or authentication email transport. */
export function privateEmailTestPolicy(env:Env){const {senderConfig:_,...policy}=parsedPolicy(env);return policy;}
export function createPrivateEmailTestTransport(env:Env,client?:ResendSendClient):EmailGateway{
 const policy=parsedPolicy(env);
 if(!client&&(!env.RESEND_API_KEY||/\s/.test(env.RESEND_API_KEY)))throw new Error('Private email test SDK key required');
 const gateway=new ResendDigestGateway(policy.senderConfig,client??new Resend(env.RESEND_API_KEY!));
 return {async send(message,key){
  if(!policy.recipients.includes(message.to.toLowerCase())||!message.subject.startsWith('[TEST] ')||!key.startsWith('email-test/'))throw new Error('Private email test destination or purpose rejected');
  return gateway.send(message,key);
 }};
}
