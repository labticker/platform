import {spawn} from 'node:child_process';
export async function stageFlySecrets(app:string,values:Readonly<Record<string,string>>){
 if(!/^[a-z][a-z0-9-]{2,50}$/.test(app)||!process.env.FLY_API_TOKEN)throw new Error('Approved Fly target and token required');
 const allowed=new Set(['WEB_DATABASE_URL','WORKER_DATABASE_URL','REPORT_DATABASE_URL','AUTH_SECRET','AUTH_GITHUB_ID','AUTH_GITHUB_SECRET','UNSUBSCRIBE_SECRET','ANALYTICS_REPORT_TOKEN','RESEND_WEBHOOK_SECRET','POSTHOG_QUERY_API_KEY','RESEND_API_KEY','EMAIL_ROLLOUT_APPROVAL_JSON','EMAIL_TEST_APPROVAL_JSON','SENDER_IDENTITY','SENDER_CONTACT']);
 const lines=Object.entries(values).map(([name,value])=>{if(!allowed.has(name)||!value||/[\r\n\0]/.test(value))throw new Error('Invalid secret input');return `${name}=${value}`;});
 const env:NodeJS.ProcessEnv={FLY_API_TOKEN:process.env.FLY_API_TOKEN};
 for(const name of ['PATH','HOME','USERPROFILE','APPDATA','LOCALAPPDATA','SYSTEMROOT','TEMP','TMP','SSL_CERT_FILE','SSL_CERT_DIR'])if(process.env[name])env[name]=process.env[name];
 await new Promise<void>((resolve,reject)=>{
  const child=spawn(process.env.FLYCTL_EXECUTABLE??'flyctl',['secrets','import','--app',app,'--stage'],{env,stdio:['pipe','ignore','ignore'],windowsHide:true});
  child.once('error',()=>reject(new Error('Secret staging failed')));
  child.once('exit',code=>code===0?resolve():reject(new Error('Secret staging failed')));
  child.stdin.on('error',()=>reject(new Error('Secret staging failed')));
  child.stdin.end(lines.join('\n')+'\n');
 });
}
