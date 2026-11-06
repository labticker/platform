import {readFile,writeFile} from 'node:fs/promises';
import {createEmailTransport} from '../packages/notifications/src/resend.js';
import {createPrivateEmailTestTransport} from '../packages/notifications/src/email-testing.js';
import {ownerEmailPolicy} from './owner-email-policy.js';
async function main(){
 const env=process.env,app=env.ACTUAL_APP??'',project=env.POSTHOG_PROJECT??'',host=env.POSTHOG_HOST??'',start=env.MEASUREMENT_START??'';
 const stage=env.ROLLOUT_STAGE??'owner-acceptance',ownerOnly=stage!=='public-pilot',ownerEmail=stage==='owner-email-pilot';
 if(!['owner-acceptance','owner-email-pilot','public-pilot'].includes(stage)||!/^[a-z][a-z0-9-]{2,50}$/.test(app))throw new Error('Assigned rollout target required');
 if(!ownerOnly&&(!/^\d{1,12}$/.test(project)||!['https://us.i.posthog.com','https://eu.i.posthog.com'].includes(host)||!env.POSTHOG_KEY||!env.POSTHOG_QUERY_KEY||!/^\d{4}-\d{2}-\d{2}$/.test(start)||new Date(start).toISOString().slice(0,10)!==start||env.ANALYTICS_ENABLED!=='true'))throw new Error('Approved project analytics configuration required');
 const mode=env.EMAIL_DELIVERY_MODE??'mock',live=mode==='resend';if(!['mock','resend'].includes(mode))throw new Error('Invalid email delivery mode');
 if(ownerOnly&&((live&&!ownerEmail)||env.EMAIL_AUTH_ENABLED==='true'))throw new Error('Owner acceptance cannot activate email');
 if(ownerEmail){ownerEmailPolicy(env);if(!env.RESEND_WEBHOOK_SECRET)throw new Error('Signed webhook required');}
 let text=(await readFile('fly.pilot.example.toml','utf8')).replaceAll('REPLACE_WITH_ASSIGNED_APP',app).replaceAll('REPLACE_WITH_OWNER_ACCESS',String(ownerOnly)).replaceAll('REPLACE_WITH_POSTHOG_PROJECT',project).replaceAll('REPLACE_WITH_POSTHOG_API_HOST',host==='https://us.i.posthog.com'?'https://us.posthog.com':'https://eu.posthog.com').replaceAll('REPLACE_WITH_MEASUREMENT_START',start);
 if(ownerOnly)text=text.replace(/^  POSTHOG_(?:PROJECT_ID|API_HOST|MEASUREMENT_START_DATE) = .*\r?\n/gm,'');
 if(env.EMAIL_TEST_ENABLED==='true'){
  if(!ownerOnly||live||env.EMAIL_AUTH_ENABLED==='true'||!env.RESEND_WEBHOOK_SECRET)throw new Error('Private email tests require owner-only mock mode and signed webhook configuration');
  createPrivateEmailTestTransport({...env,APP_URL:`https://${app}.fly.dev`,OWNER_ACCEPTANCE_ONLY:'true',PUBLIC_EMAIL_ENABLED:'false'});
  text=text.replace('  PUBLIC_EMAIL_ENABLED = "false"','  PUBLIC_EMAIL_ENABLED = "false"\n  EMAIL_TEST_ENABLED = "true"');
 }else{text=text.replace('  PUBLIC_EMAIL_ENABLED = "false"','  PUBLIC_EMAIL_ENABLED = "false"\n  EMAIL_TEST_ENABLED = "false"');}
 if(ownerEmail){
  text=text.replace('EMAIL_DELIVERY_MODE = "mock"','EMAIL_DELIVERY_MODE = "resend"').replace('WORKER_MODE = "mock-pilot"','WORKER_MODE = "digest-pilot"');
  text=text.replace(/^  SENDER_(?:IDENTITY|CONTACT) = .*\r?\n/gm,'');
 }else if(live){
  const config=JSON.parse(env.EMAIL_ROLLOUT_APPROVAL_JSON??'');
  if(!env.LIVE_EMAIL_APPROVAL_REFERENCE||config.ownerApproval?.reference!==env.LIVE_EMAIL_APPROVAL_REFERENCE)throw new Error('Live email owner decision does not match deployment');
  createEmailTransport({...env,APP_URL:`https://${app}.fly.dev`,PUBLIC_EMAIL_ENABLED:'true'});
  for(const key of ['SENDER_IDENTITY','SENDER_CONTACT'])if(!env[key]?.trim()||env[key]!.length>500||/[\r\n\0]/.test(env[key]!))throw new Error('Approved sender identity/contact required');
  text=text.replace('EMAIL_DELIVERY_MODE = "mock"','EMAIL_DELIVERY_MODE = "resend"').replace('PUBLIC_EMAIL_ENABLED = "false"','PUBLIC_EMAIL_ENABLED = "true"').replace('WORKER_MODE = "mock-pilot"','WORKER_MODE = "digest-pilot"');
  text=text.replace(/^  SENDER_IDENTITY = .*$/m,`  SENDER_IDENTITY = ${JSON.stringify(env.SENDER_IDENTITY)}`).replace(/^  SENDER_CONTACT = .*$/m,`  SENDER_CONTACT = ${JSON.stringify(env.SENDER_CONTACT)}`);
 }
 if(env.EMAIL_AUTH_ENABLED==='true'){if(!live)throw new Error('Authentication email requires verified live sender');text+='\n';text=text.replace('  GITHUB_OAUTH_ENABLED = "true"','  GITHUB_OAUTH_ENABLED = "true"\n  EMAIL_AUTH_ENABLED = "true"');}
 await writeFile('fly.toml',text);console.log(JSON.stringify({configuration:stage,app,ownerAccessOnly:ownerOnly,deliveryMode:mode,authenticationEmail:env.EMAIL_AUTH_ENABLED==='true',advertising:false}));
}
main().catch(()=>{console.error('Pilot configuration rejected; check approved analytics, sender and rollout evidence. No secrets logged.');process.exitCode=1;});
