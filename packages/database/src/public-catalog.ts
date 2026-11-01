import {and,asc,desc,eq,inArray,sql} from 'drizzle-orm';
import type {PgDatabase,PgQueryResultHKT} from 'drizzle-orm/pg-core';
import * as s from './schema.js';
type Database=PgDatabase<PgQueryResultHKT,typeof s>;
export type SourceState='tracking'|'stale'|'degraded'|'pending'|'paused'|'unsupported';
type Source={enabled:boolean;failureCount:number;lastOkAt:Date|null;historyLimited:boolean};
export function sourceState(sources:readonly Source[],now=new Date()):SourceState{
 if(!sources.length)return 'unsupported';
 const enabled=sources.filter(source=>source.enabled);if(!enabled.length)return 'paused';
 if(enabled.some(source=>source.failureCount>0))return 'degraded';
 if(!enabled.some(source=>source.lastOkAt))return 'pending';
 return enabled.some(source=>source.lastOkAt&&now.getTime()-source.lastOkAt.getTime()<=4*3600000)?'tracking':'stale';
}
/** Public projection only: no subscribers, account IDs, provider credentials or raw errors. */
export async function readPublicCatalog(db:Database,now=new Date(),applicationId?:string){
 const applications=await db.select({id:s.applications.id,slug:s.applications.slug,name:s.applications.name,summary:s.applications.description,category:s.applications.category,website:s.applications.homepageUrl,repository:s.applications.repoUrl,isActive:s.applications.isActive}).from(s.applications).where(and(eq(s.applications.hidden,false),applicationId?eq(s.applications.id,applicationId):undefined)).orderBy(asc(s.applications.name)).limit(500);
 if(!applications.length)return [];
 const ids=applications.map(app=>app.id);
 const [sources,aliases,latest]=await Promise.all([
  db.select({appId:s.releaseSources.applicationId,enabled:s.releaseSources.enabled,failureCount:s.releaseSources.failureCount,lastOkAt:s.releaseSources.lastOkAt,historyLimited:s.releaseSources.historyLimited}).from(s.releaseSources).where(inArray(s.releaseSources.applicationId,ids)).limit(2000),
  db.select({appId:s.appAliases.applicationId,alias:s.appAliases.alias}).from(s.appAliases).where(inArray(s.appAliases.applicationId,ids)).limit(6500),
  db.selectDistinctOn([s.releases.applicationId],{appId:s.releases.applicationId,title:s.releases.title,tag:s.releases.tag,publishedAt:s.releases.publishedAt,firstSeenAt:s.releases.firstSeenAt}).from(s.releases).where(inArray(s.releases.applicationId,ids)).orderBy(s.releases.applicationId,desc(sql`coalesce(${s.releases.publishedAt},${s.releases.firstSeenAt})`),desc(s.releases.firstSeenAt)).limit(500),
 ]);
 return applications.map(app=>{const feeds=sources.filter(source=>source.appId===app.id);return {...app,aliases:aliases.filter(alias=>alias.appId===app.id).map(alias=>alias.alias),sourceState:!app.isActive?'paused' as const:sourceState(feeds,now),canMonitor:app.isActive&&feeds.some(source=>source.enabled),historyLimited:feeds.some(source=>source.enabled&&source.historyLimited),lastSuccessfulPoll:feeds.flatMap(source=>source.lastOkAt?[source.lastOkAt]:[]).sort((a,b)=>b.getTime()-a.getTime())[0]??null,latest:latest.find(release=>release.appId===app.id)??null};});
}
export async function readPublicApplication(db:Database,slug:string,now=new Date()){
 if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)||slug.length>80)return null;
 let [application]=await db.select({id:s.applications.id,slug:s.applications.slug}).from(s.applications).where(and(eq(s.applications.slug,slug),eq(s.applications.hidden,false))).limit(1);
 if(!application){[application]=await db.select({id:s.applications.id,slug:s.applications.slug}).from(s.applications).innerJoin(s.appAliases,eq(s.appAliases.applicationId,s.applications.id)).where(and(eq(s.appAliases.alias,slug),eq(s.applications.hidden,false))).limit(1);}
 if(!application)return null;
 const app=(await readPublicCatalog(db,now,application.id))[0];if(!app)return null;
 const [releases,sources,provenance]=await Promise.all([
  db.select({id:s.releases.id,title:s.releases.title,tag:s.releases.tag,url:s.releases.releaseUrl,notes:sql<string>`left(${s.releases.notesText},1200)`,publishedAt:s.releases.publishedAt,firstSeenAt:s.releases.firstSeenAt,backfill:s.releases.isBackfill,warnings:s.releases.warningFlags}).from(s.releases).where(eq(s.releases.applicationId,app.id)).orderBy(desc(sql`coalesce(${s.releases.publishedAt},${s.releases.firstSeenAt})`),desc(s.releases.firstSeenAt)).limit(25),
  db.select({provider:s.releaseSources.provider,url:s.releaseSources.url,enabled:s.releaseSources.enabled,lastPolledAt:s.releaseSources.lastPolledAt,lastOkAt:s.releaseSources.lastOkAt,historyLimited:s.releaseSources.historyLimited}).from(s.releaseSources).where(eq(s.releaseSources.applicationId,app.id)).limit(20),
  db.select({provider:s.appSourceRecords.provider,path:s.appSourceRecords.provenanceUrl,revision:s.appSourceRecords.gitCommit,lastSeenAt:s.appSourceRecords.lastSeenAt}).from(s.appSourceRecords).where(eq(s.appSourceRecords.applicationId,app.id)).orderBy(desc(s.appSourceRecords.lastSeenAt)).limit(20),
 ]);
 return {app,releases,sources,provenance};
}
