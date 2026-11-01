import {getDatabase} from '@labticker/database/runtime';
import {jobRuns} from '@labticker/database/schema';
import {eq,desc} from 'drizzle-orm';
import {githubOAuthAllowed,emailAuthAllowed} from '../../../lib/auth-policy';
export const dynamic='force-dynamic';
type Health={service:string;status:string;emailDeliveryMode:string;workerReady:boolean;databaseReady:boolean;analyticsEnabled:boolean;signInEnabled:boolean;ownerAccessOnly:boolean};
let cached:{value:Health;expires:number}|undefined;
let pending:Promise<Health>|undefined;
async function inspect():Promise<Health>{
 const signInEnabled=githubOAuthAllowed(process.env)||emailAuthAllowed(process.env),ownerAccessOnly=process.env.OWNER_ACCEPTANCE_ONLY==='true';
 const analyticsEnabled=process.env.ANALYTICS_PROVIDER==='posthog'&&!!process.env.NEXT_PUBLIC_POSTHOG_KEY&&['https://us.i.posthog.com','https://eu.i.posthog.com'].includes(process.env.NEXT_PUBLIC_POSTHOG_HOST??'');
 const base={service:'LabTicker',status:'preview',emailDeliveryMode:process.env.EMAIL_DELIVERY_MODE==='resend'?'resend':'mock',workerReady:false,databaseReady:false,analyticsEnabled,signInEnabled,ownerAccessOnly};
 if(!signInEnabled)return base;
 try{
  const [tick]=await getDatabase().select({startedAt:jobRuns.startedAt,status:jobRuns.status}).from(jobRuns).where(eq(jobRuns.jobName,'worker-tick')).orderBy(desc(jobRuns.startedAt)).limit(1);
  const workerReady=!!tick&&tick.status==='completed'&&Date.now()-tick.startedAt.getTime()<35*60000;
  return {...base,status:workerReady&&ownerAccessOnly?'owner-acceptance':workerReady&&analyticsEnabled?'mvp-pilot':'mvp-starting',databaseReady:true,workerReady};
 }catch{return {...base,status:'degraded'};}
}
export async function GET(){
 if(!cached||cached.expires<=Date.now()){
  pending??=inspect();
  try{const value=await pending;cached={value,expires:Date.now()+(value.workerReady?900000:30000)};}finally{pending=undefined;}
 }
 const value=cached.value;
 return Response.json(value,{status:value.status==='degraded'?503:200,headers:{'Cache-Control':'no-store'}});
}
