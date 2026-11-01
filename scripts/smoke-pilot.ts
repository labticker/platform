const app=process.env.FLY_APP??'';
if(!/^[a-z][a-z0-9-]{2,50}$/.test(app))throw new Error('Assigned Fly app required');
const origin=`https://${app}.fly.dev`;
const emailMode=process.env.EMAIL_DELIVERY_MODE==='resend'?'resend':'mock';
const ownerOnly=(process.env.ROLLOUT_STAGE??'owner-acceptance')==='owner-acceptance';
async function main(){
 const login=await fetch(`${origin}/auth/sign-in`,{signal:AbortSignal.timeout(15000)});
 const html=await login.text();
 if(!login.ok||!html.includes('GitHub'))throw new Error('GitHub pilot sign-in not available');
 const inbox=await fetch(`${origin}/auth/mock-inbox`,{redirect:'manual',signal:AbortSignal.timeout(15000)});
 if(inbox.status!==404)throw new Error('Development inbox is exposed');
 const report=await fetch(`${origin}/api/admin/analytics/summary?from=2026-01-01&to=2026-01-02`,{signal:AbortSignal.timeout(15000)});
 if(report.status!==401)throw new Error('Aggregate report authorization failed');
 let accepted=false;
 for(let attempt=0;attempt<32;attempt++){
  const response=await fetch(`${origin}/api/health`,{signal:AbortSignal.timeout(15000)});
  const health=await response.json() as {service?:string;status?:string;emailDeliveryMode?:string;workerReady?:boolean};
  if(response.ok&&health.service==='LabTicker'&&health.emailDeliveryMode===emailMode&&health.workerReady===true&&health.status===(ownerOnly?'owner-acceptance':'mvp-pilot')){accepted=true;break;}
  await new Promise(resolve=>setTimeout(resolve,30000));
 }
 if(!accepted)throw new Error('Pilot DB/worker/analytics readiness has not completed');
 console.log(JSON.stringify({service:'LabTicker',pilot:`github-oauth/${emailMode}-email`,origin,workerReady:true,publicEmailEnabled:emailMode==='resend',manualOAuthRoundTripRequired:true}));
}
main().catch(()=>{console.error('Pilot smoke failed; inspect restricted deployment diagnostics without exporting subscriber records');process.exitCode=1;});
