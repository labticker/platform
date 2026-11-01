import {randomBytes} from 'node:crypto';
import {stageFlySecrets} from './fly-secret-stdin.js';
async function main(){
 if(process.env.PILOT_SECRETS_APPROVED!=='true')throw new Error('Explicit pilot-secret approval required');
 const values:Record<string,string>={};
 for(const key of ['AUTH_SECRET','AUTH_GITHUB_ID','AUTH_GITHUB_SECRET','UNSUBSCRIBE_SECRET','ANALYTICS_REPORT_TOKEN','POSTHOG_QUERY_API_KEY']){
  const value=process.env[key];
  if(value)values[key]=value;
 }
 if(!values.AUTH_SECRET||values.AUTH_SECRET.length<32||!values.AUTH_GITHUB_ID||!values.AUTH_GITHUB_SECRET)throw new Error('Approved GitHub OAuth credentials and strong auth secret required');
 // Generate initial operational keys only during explicitly approved first bootstrap.
 if(process.env.RUNTIME_ROLES_BOOTSTRAP==='true')for(const key of ['UNSUBSCRIBE_SECRET','ANALYTICS_REPORT_TOKEN'])values[key]??=randomBytes(48).toString('base64url');
 if(process.env.EMAIL_DELIVERY_MODE==='resend')for(const key of ['RESEND_API_KEY','EMAIL_ROLLOUT_APPROVAL_JSON','RESEND_WEBHOOK_SECRET']){if(!process.env[key])throw new Error('Verified live sender secrets required');values[key]=key==='EMAIL_ROLLOUT_APPROVAL_JSON'?JSON.stringify(JSON.parse(process.env[key]!)):process.env[key]!;}
 await stageFlySecrets(process.env.FLY_APP??'',values);
 console.log('Approved pilot secrets staged through stdin; no credential values logged');
}
main().catch(()=>{console.error('Pilot secret staging failed');process.exitCode=1;});
