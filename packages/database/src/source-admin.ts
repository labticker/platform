import {and,asc,eq,isNull} from 'drizzle-orm';
import type {PgDatabase,PgQueryResultHKT} from 'drizzle-orm/pg-core';
import * as s from './schema.js';
type Database=PgDatabase<PgQueryResultHKT,typeof s>;
export type RegistrySourceMap=ReadonlyMap<string,ReadonlySet<string>>;
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
function requireUuid(value:string){if(!uuid.test(value))throw new Error('Invalid source administration identifier');}
async function requireAdministrator(db:Database,actorUserId:string,lock=false){
 requireUuid(actorUserId);
 const query=db.select({id:s.users.id,role:s.users.role,verified:s.users.emailVerified}).from(s.users).where(and(eq(s.users.id,actorUserId),isNull(s.users.deletedAt)));
 const [actor]=await (lock?query.for('update'):query);
 if(!actor?.verified||actor.role!=='admin')throw new Error('Administrator required');
}
/** Projection deliberately contains no subscriber, recipient or authentication columns. */
export async function listSourceStatus(db:Database,actorUserId:string){
 await requireAdministrator(db,actorUserId);
 return db.select({id:s.releaseSources.id,applicationId:s.applications.id,slug:s.applications.slug,name:s.applications.name,provider:s.releaseSources.provider,repository:s.releaseSources.externalKey,enabled:s.releaseSources.enabled,lastPolledAt:s.releaseSources.lastPolledAt,lastOkAt:s.releaseSources.lastOkAt,failureCount:s.releaseSources.failureCount,nextPollAt:s.releaseSources.nextPollAt,historyLimited:s.releaseSources.historyLimited,hasError:s.releaseSources.lastError})
  .from(s.releaseSources).innerJoin(s.applications,eq(s.applications.id,s.releaseSources.applicationId)).orderBy(asc(s.applications.name),asc(s.releaseSources.id)).limit(200)
  .then(rows=>rows.map(({hasError:_,...row})=>({...row,hasError:row.failureCount>0})));
}
/** Only existing, reviewed GitHub source mappings can change state. The caller loads
 * registry membership from the local validated Git checkout, never request fields.
 * Database role authorization is repeated even if a server route already checked it.
 */
export async function setSourceEnabled(db:Database,actorUserId:string,sourceId:string,enabled:boolean,registry:RegistrySourceMap,now=new Date()):Promise<void>{
 requireUuid(sourceId);if(typeof enabled!=='boolean'||!Number.isFinite(now.getTime()))throw new Error('Invalid source administration request');
 await db.transaction(async tx=>{
  await requireAdministrator(tx,actorUserId,true);
  const [source]=await tx.select().from(s.releaseSources).where(eq(s.releaseSources.id,sourceId)).for('update');
  if(!source)throw new Error('Source unavailable');
  const [app]=await tx.select({id:s.applications.id,slug:s.applications.slug,active:s.applications.isActive,hidden:s.applications.hidden}).from(s.applications).where(eq(s.applications.id,source.applicationId));
  const [provenance]=await tx.select({hash:s.appSourceRecords.sourceHash,revision:s.appSourceRecords.gitCommit}).from(s.appSourceRecords).where(and(eq(s.appSourceRecords.applicationId,source.applicationId),eq(s.appSourceRecords.provider,'custom_json'))).limit(1);
  if(!app||!provenance?.hash||!/^[a-f0-9]{7,64}$/.test(provenance.revision)||source.provider!=='github-releases'||!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}\/[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(source.externalKey)||source.url!==`https://api.github.com/repos/${source.externalKey}/releases`)throw new Error('Source requires a reviewed catalog mapping');
  if(enabled&&(!app.active||app.hidden||!registry.get(app.slug)?.has(source.externalKey.toLowerCase())))throw new Error('Source is absent from the current approved registry');
  if(source.enabled===enabled)return;
  await tx.update(s.releaseSources).set({enabled,...(enabled?{nextPollAt:now}:{})}).where(eq(s.releaseSources.id,source.id));
  await tx.insert(s.catalogChanges).values({applicationId:app.id,sourceHash:provenance.hash,gitCommit:provenance.revision,changedAt:now,previous:{kind:'source_control',sourceId:source.id,enabled:source.enabled},current:{kind:'source_control',sourceId:source.id,enabled,actorUserId}});
 });
}
