import {and,eq,lt,lte,or,isNull,asc} from 'drizzle-orm';
import type {PgDatabase,PgQueryResultHKT} from 'drizzle-orm/pg-core';
import * as schema from '@labticker/database/schema';
import {GitHubReleasesAdapter,prepareReleaseBatch,classifyRelease} from '@labticker/releases';
import type {ReleaseAdapter} from '@labticker/releases';
type Database=PgDatabase<PgQueryResultHKT,typeof schema>;
export interface PollOutcome {status:'idle'|'updated'|'unchanged'|'failed';inserted:number;}
/** The source row lock serializes polls across workers. It is held through bounded HTTP
 * and insertion so a crash rolls back the complete poll, including its baseline marker.
 */
export async function pollOneSource(db:Database,adapter:ReleaseAdapter=new GitHubReleasesAdapter(undefined,undefined,5,'recent-window'),now=new Date()):Promise<PollOutcome>{
 let sourceId:string|undefined;let lastPolledAt:Date|null=null;let failureCount=0;
 try {
  return await db.transaction(async tx=>{
   const [source]=await tx.select({source:schema.releaseSources}).from(schema.releaseSources)
    .innerJoin(schema.applications,eq(schema.applications.id,schema.releaseSources.applicationId))
    .where(and(eq(schema.releaseSources.enabled,true),eq(schema.releaseSources.provider,'github-releases'),eq(schema.applications.isActive,true),or(lte(schema.releaseSources.nextPollAt,now),and(isNull(schema.releaseSources.nextPollAt),or(isNull(schema.releaseSources.lastPolledAt),lt(schema.releaseSources.lastPolledAt,new Date(now.getTime()-60*60*1000)))))))
    .orderBy(asc(schema.releaseSources.lastPolledAt)).limit(1).for('update',{of:schema.releaseSources,skipLocked:true});
   if(!source) return {status:'idle',inserted:0};
   const row=source.source;sourceId=row.id;lastPolledAt=row.lastPolledAt;failureCount=row.failureCount;
   const result=await adapter.fetchReleases({kind:'github-releases',repository:row.externalKey,channel:'stable'},{...(row.etag?{etag:row.etag}:{}),...(row.lastModified?{lastModified:row.lastModified}:{})});
   let inserted=0;
   if(result.status==='modified'){
    for(const release of prepareReleaseBatch(row.applicationId,result.releases,row.lastOkAt===null)){
     const warnings=classifyRelease({notesText:release.notesText,releaseUrl:release.releaseUrl,previousTag:null,currentTag:release.versionTag,versionScheme:'unknown'});
     const saved=await tx.insert(schema.releases).values({applicationId:row.applicationId,releaseSourceId:row.id,sourceGuid:release.guid,dedupeKey:release.dedupeKey,tag:release.versionTag,title:release.title,releaseUrl:release.releaseUrl,notesText:release.notesText,publishedAt:release.publishedAt,firstSeenAt:release.observedAt,isBackfill:release.isBackfill,warningFlags:warnings}).onConflictDoNothing({target:[schema.releases.applicationId,schema.releases.dedupeKey]}).returning({id:schema.releases.id});
     inserted+=saved.length;
    }
   }
   const truncated=result.status==='modified'?result.historyTruncated===true:row.historyLimited;
   const coverageWarning=truncated?'Recent history only; releases beyond 500 source records are not monitored':null;
   await tx.update(schema.releaseSources).set({etag:result.cache.etag??null,lastModified:result.cache.lastModified??null,lastPolledAt:now,lastOkAt:now,lastError:coverageWarning,historyLimited:truncated,failureCount:0,nextPollAt:new Date(now.getTime()+60*60*1000)}).where(eq(schema.releaseSources.id,row.id));
   await tx.update(schema.applications).set({status:truncated?'limited-history':'active'}).where(eq(schema.applications.id,row.applicationId));
   return {status:result.status==='modified'?'updated':'unchanged',inserted};
  });
 }catch{
  // Never store arbitrary upstream error text, URLs, release content or credentials in operational logs.
  if(sourceId) await db.update(schema.releaseSources).set({lastPolledAt:now,lastError:'Source poll failed; retained previous releases',failureCount:Math.min(failureCount+1,100),nextPollAt:new Date(now.getTime()+Math.min(5*60*1000*2**Math.min(failureCount,10),6*60*60*1000))}).where(and(eq(schema.releaseSources.id,sourceId),lastPolledAt===null?isNull(schema.releaseSources.lastPolledAt):eq(schema.releaseSources.lastPolledAt,lastPolledAt)));
  return {status:'failed',inserted:0};
 }
}
