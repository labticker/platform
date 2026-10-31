import {redirect} from 'next/navigation';
import {getCurrentUser} from '../../../lib/auth';
import {getDatabase} from '@labticker/database/runtime';
import {readOperations} from '@labticker/database/operations';
export const dynamic='force-dynamic';
export default async function Operations(){
 const user=await getCurrentUser();if(!user)redirect('/auth/sign-in');if(user.role!=='admin')return <main><h1>Access denied</h1></main>;
 const result=await readOperations(getDatabase(),user.id).catch(()=>null);
 if(!result)return <main><h1>Operations unavailable</h1><p>Review restricted infrastructure diagnostics.</p></main>;
 return <main><h1>Worker operations</h1><nav><a href="/admin">Product metrics</a> · <a href="/admin/sources">Release sources</a></nav><p>Worker tick: {result.heartbeat}. This is operational freshness, not production acceptance.</p><p>Last start: {result.lastTickStartedAt?.toISOString()??'Not observed'}. Last finish: {result.lastTickFinishedAt?.toISOString()??'Not observed'}.</p><h2>Queue counts</h2><ul>{result.queue.map(row=><li key={row.status}>{row.status}: {row.count}</li>)}</ul><p>Failed digests require reconciliation. Never blindly resend an attempt with uncertain acceptance.</p><h2>Recent jobs</h2><table><thead><tr><th>Job</th><th>Status</th><th>Started (UTC)</th><th>Counts</th></tr></thead><tbody>{result.jobs.map((job,index)=><tr key={index}><td>{job.name}</td><td>{job.status}</td><td>{job.startedAt.toISOString()}</td><td><code>{JSON.stringify(job.counts)}</code></td></tr>)}</tbody></table></main>;
}
