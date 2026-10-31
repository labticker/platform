import {and,eq,isNull,isNotNull,desc,sql} from 'drizzle-orm';
import type {PgDatabase,PgQueryResultHKT} from 'drizzle-orm/pg-core';
import * as s from './schema.js';
type Database=PgDatabase<PgQueryResultHKT,typeof s>;
export const workerJobs=['worker-tick','catalog-sync','release-poll','digest-prepare','digest-send','aggregate-refresh','source-snapshot'] as const;
export type WorkerJob=typeof workerJobs[number];
const countNames=['catalogEntries','polledSources','failedSources','insertedReleases','preparedDigests','acceptedDigests','skippedDigests','retriedDigests','failedDigests','reportDates'] as const;
export type WorkerCounts=Partial<Record<typeof countNames[number],number>>;
export function safeJobCounts(input:unknown):WorkerCounts{
 if(!input||typeof input!=='object'||Array.isArray(input))return {};
 const record=input as Record<string,unknown>;
 return Object.fromEntries(countNames.flatMap(name=>typeof record[name]==='number'&&Number.isSafeInteger(record[name])&&record[name]>=0&&record[name]<=1e9?[[name,record[name]]]:[]));
}
/** Start is durable before work begins. A process crash leaves an observable running row.
 * Failures retain only a fixed category; never store arbitrary errors or callback metadata.
 */
export async function runWorkerJob<T>(db:Database,name:WorkerJob,work:()=>Promise<{value:T;counts?:WorkerCounts}>,clock:()=>Date=()=>new Date()):Promise<T>{
 if(!workerJobs.includes(name))throw new Error('Unknown worker job');
 const [job]=await db.insert(s.jobRuns).values({jobName:name,startedAt:clock(),status:'running',counts:{}}).returning({id:s.jobRuns.id});
 if(!job)throw new Error('Worker job unavailable');
 try{
  const result=await work();
  await db.update(s.jobRuns).set({finishedAt:clock(),status:'completed',counts:safeJobCounts(result.counts),error:null}).where(eq(s.jobRuns.id,job.id));
  return result.value;
 }catch{
  await db.update(s.jobRuns).set({finishedAt:clock(),status:'failed',error:'Worker job failed'}).where(eq(s.jobRuns.id,job.id));
  throw new Error('Worker job failed');
 }
}
export async function readOperations(db:Database,actorUserId:string,now=new Date()){
 if(!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(actorUserId))throw new Error('Administrator required');
 const [admin]=await db.select({id:s.users.id}).from(s.users).where(and(eq(s.users.id,actorUserId),eq(s.users.role,'admin'),isNotNull(s.users.emailVerified),isNull(s.users.deletedAt)));
 if(!admin)throw new Error('Administrator required');
 const jobs=await db.select({name:s.jobRuns.jobName,status:s.jobRuns.status,startedAt:s.jobRuns.startedAt,finishedAt:s.jobRuns.finishedAt,counts:s.jobRuns.counts}).from(s.jobRuns).orderBy(desc(s.jobRuns.startedAt)).limit(30);
 const ticks=await db.select({status:s.jobRuns.status,startedAt:s.jobRuns.startedAt,finishedAt:s.jobRuns.finishedAt}).from(s.jobRuns).where(eq(s.jobRuns.jobName,'worker-tick')).orderBy(desc(s.jobRuns.startedAt)).limit(1);
 const latest=ticks[0];
 const heartbeat=!latest?'missing':now.getTime()-latest.startedAt.getTime()>30*60000?'stale':latest.status==='failed'?'failed':latest.status==='running'?'running':'recent';
 const queued=await db.select({status:s.digests.status,count:sql<number>`count(*)::int`}).from(s.digests).groupBy(s.digests.status);
 return {heartbeat,lastTickStartedAt:latest?.startedAt??null,lastTickFinishedAt:latest?.finishedAt??null,
  queue:queued.filter(row=>['pending','claimed','sent','skipped','failed'].includes(row.status)),
  jobs:jobs.filter(row=>workerJobs.includes(row.name as WorkerJob)).map(row=>({...row,status:['running','completed','failed'].includes(row.status)?row.status:'unknown',counts:safeJobCounts(row.counts)})),
  productionReady:false as const};
}
