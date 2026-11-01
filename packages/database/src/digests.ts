import {and,eq,gt,lte,desc,asc,isNull,notExists,inArray,sql} from 'drizzle-orm';
import type {PgDatabase,PgQueryResultHKT} from 'drizzle-orm/pg-core';
import {isIP} from 'node:net';
import * as s from './schema.js';
type Database=PgDatabase<PgQueryResultHKT,typeof s>;
export interface DigestPreviewRelease{appName:string;title:string;version:string;notes:string;url:string|null;publishedAt:string|null;warnings:string[];}
function publicLink(value:unknown):string|null{
 try{if(typeof value!=='string'||value.length>2048)return null;const url=new URL(value),host=url.hostname.toLowerCase();if(url.protocol!=='https:'||url.username||url.password||url.port||isIP(host)||host.startsWith('[')||!host.includes('.')||host.endsWith('.')||/(^|\.)(localhost|local|internal|invalid|test|home|lan)$/.test(host))return null;url.hash='';url.search='';return url.href;}catch{return null;}
}
function date(value:unknown):string|null{if(!(value instanceof Date)&&typeof value!=='string')return null;const parsed=new Date(value);return Number.isFinite(parsed.getTime())?parsed.toISOString():null;}
function warnings(value:unknown):string[]{return Array.isArray(value)?value.flatMap(item=>typeof item==='string'?[item.slice(0,240)]:item&&typeof item==='object'&&'label'in item&&typeof item.label==='string'?[item.label.slice(0,240)]:[]).slice(0,8):[];}
function release(row:{appName:string|null;title:string|null;version:string|null;notes:string|null;url:string|null;publishedAt:unknown;warnings:unknown}):DigestPreviewRelease{return {appName:(row.appName??'Application').slice(0,100),title:(row.title??'Release').slice(0,1000),version:(row.version??'').slice(0,256),notes:(row.notes??'').slice(0,600),url:publicLink(row.url),publishedAt:date(row.publishedAt),warnings:warnings(row.warnings)};}
/** Private read model: every query is scoped to the verified session user. Never
 * selects email bodies, recipients, provider IDs, signing tokens or raw inboxes.
 */
export async function readUserDigests(db:Database,userId:string,deliveryMode:'mock'|'resend'='mock',now=new Date()){
 if(!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(userId))throw new Error('Verified account required');
 const [user]=await db.select({id:s.users.id,verified:s.users.emailVerified,suppressed:s.users.suppressedAt}).from(s.users).where(and(eq(s.users.id,userId),isNull(s.users.deletedAt)));
 if(!user?.verified)throw new Error('Verified account required');
 const [preference]=await db.select({enabled:s.preferences.enabled,frequency:s.preferences.frequency,timezone:s.preferences.timezone,nextDueAt:s.preferences.nextDueAt}).from(s.preferences).where(eq(s.preferences.userId,userId));
 const [consent]=await db.select({id:s.emailConsents.id}).from(s.emailConsents).where(and(eq(s.emailConsents.userId,userId),eq(s.emailConsents.consentType,'digest'),isNull(s.emailConsents.withdrawnAt))).limit(1);
 const selected=await db.select({id:s.subscriptions.applicationId}).from(s.subscriptions).where(and(eq(s.subscriptions.userId,userId),eq(s.subscriptions.active,true)));
 const projection={appName:s.applications.name,title:s.releases.title,version:s.releases.tag,notes:sql<string>`left(${s.releases.notesText},600)`,url:s.releases.releaseUrl,publishedAt:s.releases.publishedAt,warnings:s.releases.warningFlags};
 const scoped=and(eq(s.subscriptions.userId,userId),eq(s.subscriptions.active,true),eq(s.applications.isActive,true),eq(s.applications.hidden,false),lte(s.releases.firstSeenAt,now));
 const delivered=db.select({id:s.deliveryReceipts.releaseId}).from(s.deliveryReceipts).where(and(eq(s.deliveryReceipts.userId,userId),eq(s.deliveryReceipts.deliveryMode,deliveryMode),eq(s.deliveryReceipts.releaseId,s.releases.id)));
 const upcoming=await db.select(projection).from(s.releases).innerJoin(s.applications,eq(s.applications.id,s.releases.applicationId)).innerJoin(s.subscriptions,eq(s.subscriptions.applicationId,s.releases.applicationId)).where(and(scoped,eq(s.releases.isBackfill,false),gt(s.releases.firstSeenAt,s.subscriptions.enabledAt),notExists(delivered))).orderBy(desc(s.releases.firstSeenAt),asc(s.releases.id)).limit(20);
 // Explicit sample: one stored stable release per selected app, including baseline
 // history. Reading this sample never queues it or changes delivery eligibility.
 const sample=await db.selectDistinctOn([s.releases.applicationId],projection).from(s.releases).innerJoin(s.applications,eq(s.applications.id,s.releases.applicationId)).innerJoin(s.subscriptions,eq(s.subscriptions.applicationId,s.releases.applicationId)).where(scoped).orderBy(s.releases.applicationId,desc(s.releases.firstSeenAt),asc(s.releases.id)).limit(20);
 const digests=await db.select({id:s.digests.id,mode:s.digests.deliveryMode,status:s.digests.status,scheduledAt:s.digests.scheduledFor,acceptedAt:s.digests.sentAt,deliveredAt:s.digestMessageEngagement.deliveredAt}).from(s.digests).leftJoin(s.digestMessageEngagement,eq(s.digestMessageEngagement.digestId,s.digests.id)).where(eq(s.digests.userId,userId)).orderBy(desc(s.digests.scheduledFor)).limit(10);
 const items=digests.length?await db.select({digestId:s.digestItems.digestId,appName:sql<string>`left(${s.digestItems.snapshot}->>'appName',100)`,title:sql<string>`left(${s.digestItems.snapshot}->>'title',1000)`,version:sql<string>`left(${s.digestItems.snapshot}->>'version',256)`,notes:sql<string>`left(${s.digestItems.snapshot}->>'notes',600)`,url:sql<string>`left(${s.digestItems.snapshot}->>'releaseUrl',2048)`,publishedAt:sql<string>`${s.digestItems.snapshot}->>'publishedAt'`,warnings:sql<unknown>`${s.digestItems.snapshot}->'warnings'`}).from(s.digestItems).innerJoin(s.digests,eq(s.digests.id,s.digestItems.digestId)).where(and(eq(s.digests.userId,userId),inArray(s.digestItems.digestId,digests.map(digest=>digest.id)))):[];
 return {deliveryMode,selectedApplications:selected.length,preferences:preference?{...preference,nextDueAt:date(preference.nextDueAt)}:null,eligibleToSchedule:!!preference?.enabled&&!!consent&&!user.suppressed,upcoming:upcoming.map(release),sample:sample.map(release),previewLimit:20,history:digests.map(digest=>({id:digest.id,mode:digest.mode,status:digest.status,scheduledAt:date(digest.scheduledAt),acceptedAt:date(digest.acceptedAt),deliveredAt:digest.mode==='resend'?date(digest.deliveredAt):null,items:items.filter(item=>item.digestId===digest.id).slice(0,100).map(release)}))};
}
