import {privateEmailTestPolicy} from '../packages/notifications/src/email-testing.js';
import {createEmailTransport,type ResendDigestApproval} from '../packages/notifications/src/resend.js';

/** Explicit owner-pilot decision reuses reviewed sender evidence, never a key alone.
 * Actual addresses remain inside protected runtime configuration, never logs/TOML. */
export function ownerEmailPolicy(env:Record<string,string|undefined>):ResendDigestApproval{
 if(env.ROLLOUT_STAGE!=='owner-email-pilot'||env.EMAIL_DELIVERY_MODE!=='resend'||env.EMAIL_AUTH_ENABLED==='true'||env.EMAIL_TEST_ENABLED==='true'||!/^owner-scheduled-email-approved\/[a-zA-Z0-9_.-]{3,100}$/.test(env.LIVE_EMAIL_APPROVAL_REFERENCE??''))throw new Error('Explicit owner scheduled-email decision required');
 const origin=`https://${env.ACTUAL_APP}.fly.dev`;
 const privatePolicy=privateEmailTestPolicy({...env,APP_URL:origin,EMAIL_TEST_ENABLED:'true',OWNER_ACCEPTANCE_ONLY:'true',EMAIL_DELIVERY_MODE:'mock',PUBLIC_EMAIL_ENABLED:'false'});
 if(privatePolicy.recipients.length!==1)throw new Error('Exactly one approved owner required');
 const source=JSON.parse(env.EMAIL_TEST_APPROVAL_JSON!) as {sender:ResendDigestApproval['sender'];trackingReview:ResendDigestApproval['trackingReview'];replyTo?:string};
 const config:ResendDigestApproval={mode:'resend',publicEmailEnabled:false,appUrl:origin,ownerApproval:{decision:'live-email-approved',reference:env.LIVE_EMAIL_APPROVAL_REFERENCE!},sender:source.sender,trackingReview:source.trackingReview,...(source.replyTo?{replyTo:source.replyTo}:{}),audience:{kind:'owner-only',recipients:privatePolicy.recipients}};
 createEmailTransport({...env,APP_URL:origin,OWNER_ACCEPTANCE_ONLY:'true',PUBLIC_EMAIL_ENABLED:'false',EMAIL_ROLLOUT_APPROVAL_JSON:JSON.stringify(config)});
 return config;
}
