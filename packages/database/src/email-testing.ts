import {and,eq,gte,isNull,desc,sql} from 'drizzle-orm';
import type {PgDatabase,PgQueryResultHKT} from 'drizzle-orm/pg-core';
import {composeDigest,signUnsubscribe} from '@labticker/notifications';
import {privateEmailTestPolicy} from '@labticker/notifications/email-testing';
import * as s from './schema.js';
import {readUserDigests} from './digests.js';
type Database=PgDatabase<PgQueryResultHKT,typeof s>;
type Env=Record<string,string|undefined>;
const uuid=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
export function emailTestingAllowed(env:Env,user:{id:string;role:string}):boolean{try{privateEmailTestPolicy(env);return uuid.test(user.id)&&user.role==='admin';}catch{return false;}}
export type EmailTestStatus='queued'|'already-queued'|'rate-limited'|'no-releases'|'blocked'|'disabled'|'suppressed';
/** Explicit one-message consent only; never alters ordinary digest consent or scheduling. */
export async function enqueueEmailTest(db:Database,input:{userId:string;consent:true;requestId:string},env:Env,now=new Date()):Promise<{status:EmailTestStatus}>{
 let policy;try{policy=privateEmailTestPolicy(env);}catch{return {status:'disabled'};}
 if(input.consent!==true||!uuid.test(input.userId)||!uuid.test(input.requestId))return {status:'blocked'};
 return db.transaction(async tx=>{
  // All enqueue operations share this lock; quota checks and insertion serialize globally.
  await tx.execute(sql`select pg_advisory_xact_lock(192837461)`);
  const [user]=await tx.select().from(s.users).where(eq(s.users.id,input.userId)).for('update');
  if(!user||!user.emailVerified||user.deletedAt||user.role!=='admin'||!policy.recipients.includes(user.email))return {status:'blocked'};
  if(user.suppressedAt)return {status:'suppressed'};
  const [existing]=await tx.select({id:s.emailTestMessages.id}).from(s.emailTestMessages).where(and(eq(s.emailTestMessages.userId,user.id),eq(s.emailTestMessages.requestId,input.requestId)));
  if(existing)return {status:'already-queued'};
  const recent=await tx.select({userId:s.emailTestMessages.userId,createdAt:s.emailTestMessages.createdAt}).from(s.emailTestMessages).where(gte(s.emailTestMessages.createdAt,new Date(now.getTime()-86400000))).limit(25);
  const own=recent.filter(row=>row.userId===user.id);
  if(recent.length>=25||own.length>=10||own.filter(row=>row.createdAt.getTime()>now.getTime()-3600000).length>=3)return {status:'rate-limited'};
  const preview=await readUserDigests(tx,user.id,'mock',now);
  if(!preview.sample.length)return {status:'no-releases'};
  const payload=composeDigest({to:user.email,origin:policy.origin,senderIdentity:policy.senderIdentity,senderContact:policy.senderContact,unsubscribeToken:signUnsubscribe(user.id,new Date(now.getTime()+365*86400000),env.UNSUBSCRIBE_SECRET??''),releases:preview.sample.map((row,index)=>({id:String(index),appId:String(index),appName:row.appName,title:row.title,version:row.version,releaseUrl:row.url??'',notes:row.notes,firstSeenAt:now,publishedAt:row.publishedAt?new Date(row.publishedAt):null,isBackfill:true,warnings:row.warnings}))});
  if(!payload)return {status:'no-releases'};
  payload.subject='[TEST] '+payload.subject;payload.html=payload.html.replace('<body>','<body><p><strong>PRIVATE EMAIL TEST — historical sample, not a scheduled digest.</strong></p>');payload.text='PRIVATE EMAIL TEST — historical sample, not a scheduled digest.\n\n'+payload.text;
  await tx.insert(s.emailTestMessages).values({userId:user.id,requestId:input.requestId,payload,createdAt:now});
  return {status:'queued'};
 });
}
export async function readEmailTestHistory(db:Database,userId:string){
 if(!uuid.test(userId))throw new Error('Verified account required');
 const [user]=await db.select({id:s.users.id}).from(s.users).where(and(eq(s.users.id,userId),isNull(s.users.deletedAt),sql`${s.users.emailVerified} is not null`));
 if(!user)throw new Error('Verified account required');
 return db.select({id:s.emailTestMessages.id,status:s.emailTestMessages.status,createdAt:s.emailTestMessages.createdAt,sentAt:s.emailTestMessages.sentAt,deliveredAt:s.emailTestMessages.deliveredAt,bouncedAt:s.emailTestMessages.bouncedAt,complainedAt:s.emailTestMessages.complainedAt}).from(s.emailTestMessages).where(eq(s.emailTestMessages.userId,userId)).orderBy(desc(s.emailTestMessages.createdAt)).limit(10);
}

export {sendOneEmailTest} from './email-test-dispatch.js';
