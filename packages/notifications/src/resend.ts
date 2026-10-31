import {Resend,type CreateEmailOptions,type CreateEmailRequestOptions} from 'resend';
import {isIP} from 'node:net';
import {appOrigin,type EmailGateway,type EmailMessage} from './core.js';

export type DeliveryDisposition='retryable'|'permanent'|'ambiguous';
/** Deliberately omits the provider response/cause, which can contain recipient data. */
export class EmailDeliveryError extends Error{
 readonly disposition:DeliveryDisposition;
 constructor(disposition:DeliveryDisposition){super(`Email delivery ${disposition}`);this.name='EmailDeliveryError';this.disposition=disposition;}
}
export interface ResendDigestApproval {
 readonly mode?:'mock'|'resend';
 readonly publicEmailEnabled?:boolean;
 readonly ownerApproval?:{readonly decision:'live-email-approved';readonly reference:string};
 readonly sender?:{readonly address:string;readonly domain:string;readonly status:'verified';readonly evidenceReference:string;readonly checkedAt:string};
 readonly authenticationDomain?:string;
 readonly trackingReview?:{readonly reference:string;readonly authOpenTracking:false;readonly authClickTracking:false;readonly digestOpenTracking:false;readonly digestClickTracking:false};
 readonly appUrl?:string;
 readonly requestTimeoutMs?:number;
}
export interface ResendSendClient {
 emails:{send(input:CreateEmailOptions,options:CreateEmailRequestOptions):Promise<{data:{id:string}|null;error:{statusCode?:number|null;name?:string}|null}>};
}
function reference(value:unknown):boolean{return typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_:/.-]{2,199}$/.test(value);}
function domain(value:string):string{
 const name=value.toLowerCase();
 if(name!==value||name.length>253||isIP(name)||!name.includes('.')||!name.split('.').every(label=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))||/(^|\.)(fly\.dev|localhost|local|internal|invalid|test)$/.test(name))throw new Error('Invalid verified sender domain');
 return name;
}
function mailbox(value:string):string{
 if(!/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+$/.test(value)||value.length>254)throw new EmailDeliveryError('permanent');
 return value.slice(value.lastIndexOf('@')+1);
}
function approve(config:ResendDigestApproval,now:Date):{from:string;origin:string}{
 const fail=()=>{throw new Error('Live digest email approval is incomplete');};
 if(config.mode!=='resend'||config.publicEmailEnabled!==true||config.ownerApproval?.decision!=='live-email-approved'||!reference(config.ownerApproval.reference))return fail();
 const sender=config.sender,tracking=config.trackingReview;
 if(!sender||sender.status!=='verified'||!reference(sender.evidenceReference)||!tracking||!reference(tracking.reference)||tracking.authOpenTracking!==false||tracking.authClickTracking!==false||tracking.digestOpenTracking!==false||tracking.digestClickTracking!==false)return fail();
 const verified=domain(sender.domain),authentication=domain(config.authenticationDomain??'');
 if(authentication===verified||mailbox(sender.address)!==verified)return fail();
 const checked=Date.parse(sender.checkedAt);if(!Number.isFinite(checked)||checked>now.getTime())return fail();
 return {from:sender.address,origin:appOrigin(config.appUrl??'')};
}
function validateMessage(message:EmailMessage,origin:string,key:string):void{
 mailbox(message.to);
 if(!/^[A-Za-z0-9_/-]{1,256}$/.test(key)||!message.subject||message.subject.length>998||/[\r\n]/.test(message.subject))throw new EmailDeliveryError('permanent');
 if(!message.html||!message.text||/<\s*(?:script|iframe|object|embed|img)\b/i.test(message.html))throw new EmailDeliveryError('permanent');
 const allowed=['List-Unsubscribe','List-Unsubscribe-Post'];
 if(Object.keys(message.headers).some(header=>!allowed.includes(header))||Object.values(message.headers).some(value=>/[\r\n]/.test(value)))throw new EmailDeliveryError('permanent');
 const unsubscribe=message.headers['List-Unsubscribe'];
 if(!unsubscribe||!/^<[^<>]+>$/.test(unsubscribe)||message.headers['List-Unsubscribe-Post']!=='List-Unsubscribe=One-Click')throw new EmailDeliveryError('permanent');
 try{const url=new URL(unsubscribe.slice(1,-1));if(url.origin!==origin||url.pathname!=='/unsubscribe'||!/^[A-Za-z0-9_.-]+$/.test(url.searchParams.get('token')??'')||url.searchParams.getAll('token').length!==1||[...url.searchParams.keys()].some(key=>key!=='token')||url.hash||url.username||url.password)throw new Error();}catch{throw new EmailDeliveryError('permanent');}
}
/** Dormant SDK boundary. Runtime continues selecting MockEmailGateway. Reviewed evidence
 * is explicit deployment input, never inferred from a key, campaign or environment flag.
 * It does not remotely verify DNS; live rollout must verify this evidence with the owner.
 */
export class ResendDigestGateway implements EmailGateway{
 private readonly sender:{from:string;origin:string};
 private readonly timeoutMs:number;
 constructor(config:ResendDigestApproval,private readonly client:ResendSendClient,now=new Date()){
  this.sender=approve(config,now);
  this.timeoutMs=config.requestTimeoutMs??10000;
  if(!Number.isSafeInteger(this.timeoutMs)||this.timeoutMs<100||this.timeoutMs>30000)throw new Error('Invalid bounded email request timeout');
 }
 async send(message:EmailMessage,idempotencyKey:string):Promise<{id:string}>{
  validateMessage(message,this.sender.origin,idempotencyKey);
  let response:Awaited<ReturnType<ResendSendClient['emails']['send']>>;
  try{response=await this.client.emails.send({from:this.sender.from,to:[message.to],subject:message.subject,html:message.html,text:message.text,headers:{...message.headers}},{idempotencyKey,signal:AbortSignal.timeout(this.timeoutMs)});}
  catch{throw new EmailDeliveryError('ambiguous');}
  if(response.error){
   const {statusCode,name}=response.error;
   if(statusCode===429||name==='concurrent_idempotent_requests')throw new EmailDeliveryError('retryable');
   if(statusCode&&statusCode>=400&&statusCode<500)throw new EmailDeliveryError('permanent');
   throw new EmailDeliveryError('ambiguous');
  }
  if(!response.data?.id||!/^[a-zA-Z0-9_-]{1,256}$/.test(response.data.id))throw new EmailDeliveryError('ambiguous');
  return {id:response.data.id};
 }
}
export function createResendDigestGateway(config:ResendDigestApproval,apiKey:string):ResendDigestGateway{
 approve(config,new Date()); // Reject incomplete policy before constructing even the SDK.
 if(!apiKey.trim())throw new Error('Resend credential is missing');
 return new ResendDigestGateway(config,new Resend(apiKey));
}
