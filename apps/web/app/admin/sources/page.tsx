import {redirect} from 'next/navigation';
import {getCurrentUser} from '../../../lib/auth';
import {getDatabase} from '@labticker/database/runtime';
import {listSourceStatus} from '@labticker/database/source-admin';
import {changeSourceState} from './actions';
import {currentSourceRegistry} from './registry';
export const dynamic='force-dynamic';
const stamp=(date:Date|null)=>date?date.toISOString():'Not recorded';
export default async function Sources(){
 const actor=await getCurrentUser();if(!actor)redirect('/auth/sign-in');if(actor.role!=='admin')return <main><h1>Access denied</h1></main>;
 const [sources,registry]=await Promise.all([listSourceStatus(getDatabase(),actor.id),currentSourceRegistry()]).catch(()=>{throw new Error('Source status unavailable');});
 return <main><h1>Release source status</h1><p>Times are UTC. Pausing polling retains subscriptions and release history. Resuming is restricted to the current reviewed Git registry and does not enable email sending.</p><p>Showing at most 200 source records. Correct repository mappings through a reviewed catalog JSON change.</p><div className="grid">{sources.map(source=>{
  const approved=source.provider==='github-releases'&&registry.get(source.slug)?.has(source.repository.toLowerCase());
  return <article key={source.id}><h2>{source.name}</h2><p>{source.provider} · {source.enabled?'Polling enabled':'Polling paused'}</p><p>Last attempt: {stamp(source.lastPolledAt)}<br/>Last success: {stamp(source.lastOkAt)}<br/>Next eligible poll: {stamp(source.nextPollAt)}</p><p>{source.failureCount} consecutive failures{source.hasError?' · Last poll failed; prior releases retained':''}</p>{source.historyLimited&&<p>Older release history was bounded; initial backfill may be incomplete.</p>}{source.provider==='github-releases'&&(source.enabled||approved)?<form action={changeSourceState}><input type="hidden" name="sourceId" value={source.id}/><input type="hidden" name="enabled" value={String(!source.enabled)}/><button>{source.enabled?'Pause polling':'Resume polling'}</button></form>:<p>Resume unavailable: source is absent from the reviewed registry or its adapter is unsupported.</p>}</article>;
 })}</div><a href="/admin">Back to product metrics</a></main>;
}

