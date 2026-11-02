import {randomUUID} from 'node:crypto';
import {and,eq,lte,or,isNull,asc} from 'drizzle-orm';
import type {PgDatabase,PgQueryResultHKT} from 'drizzle-orm/pg-core';
import * as s from './schema.js';
import type {EmailGateway,EmailMessage} from '@labticker/notifications';
import {privateEmailTestPolicy} from '@labticker/notifications/email-testing';
type Database=PgDatabase<PgQueryResultHKT,typeof s>;
type Env=Record<string,string|undefined>;
const DAY=86400000;
/** Persisted leases fence process crashes. The immutable message and stable key survive retries. */
export async function sendOneEmailTest(db:Database,gateway:EmailGateway,env:Env,now=new Date(),target?:{userId:string;requestId:string}):Promise<'idle'|'sent'|'skipped'|'failed'|'retry'|'stale'>{
 let policy;try{policy=privateEmailTestPolicy(env);}catch{return 'idle';}
 const claim=await db.transaction(async tx=>{
  const [candidate]=await tx.select({id:s.emailTestMessages.id,userId:s.emailTestMessages.userId}).from(s.users).innerJoin(s.emailTestMessages,eq(s.emailTestMessages.userId,s.users.id)).where(and(target?and(eq(s.emailTestMessages.userId,target.userId),eq(s.emailTestMessages.requestId,target.requestId)):undefined,or(and(eq(s.emailTestMessages.status,'pending'),or(isNull(s.emailTestMessages.nextAttemptAt),lte(s.emailTestMessages.nextAttemptAt,now))),and(eq(s.emailTestMessages.status,'claimed'),lte(s.emailTestMessages.claimUntil,now))))).orderBy(asc(s.emailTestMessages.createdAt)).limit(1).for('update',{of:s.users,skipLocked:true});
  if(!candidate)return null;
  const [row]=await tx.select().from(s.emailTestMessages).where(eq(s.emailTestMessages.id,candidate.id)).for('update',{skipLocked:true});
  if(!row||!['pending','claimed'].includes(row.status)||row.status==='claimed'&&(!row.claimUntil||row.claimUntil>now)||row.status==='pending'&&row.nextAttemptAt&&row.nextAttemptAt>now)return null;
  if(row.attemptCount>=5||row.firstAttemptAt&&now.getTime()-row.firstAttemptAt.getTime()>=DAY-60000){await tx.update(s.emailTestMessages).set({status:'failed',leaseToken:null,claimUntil:null,nextAttemptAt:null}).where(eq(s.emailTestMessages.id,row.id));return null;}
  const token=randomUUID();await tx.update(s.emailTestMessages).set({status:'claimed',leaseToken:token,claimUntil:new Date(now.getTime()+120000),attemptCount:row.attemptCount+1,firstAttemptAt:row.firstAttemptAt??now,nextAttemptAt:null}).where(eq(s.emailTestMessages.id,row.id));return {...candidate,token};
 });
 if(!claim)return 'idle';
 return db.transaction(async tx=>{
  const [user]=await tx.select().from(s.users).where(eq(s.users.id,claim.userId)).for('update');
  const [row]=await tx.select().from(s.emailTestMessages).where(eq(s.emailTestMessages.id,claim.id)).for('update');
  if(!row||row.status!=='claimed'||row.leaseToken!==claim.token||!row.claimUntil||row.claimUntil<=now)return 'stale';
  const finish=async(status:'skipped'|'failed')=>{await tx.update(s.emailTestMessages).set({status,leaseToken:null,claimUntil:null,nextAttemptAt:null}).where(and(eq(s.emailTestMessages.id,row.id),eq(s.emailTestMessages.leaseToken,claim.token)));return status;};
  // Revalidate immediately before every provider attempt, under the account lock.
  try{policy=privateEmailTestPolicy(env);}catch{return finish('skipped');}
  if(!user||!user.emailVerified||user.role!=='admin'||user.deletedAt||user.suppressedAt||!policy.recipients.includes(user.email))return finish('skipped');
  const payload=row.payload as EmailMessage;
  if(!payload||payload.to!==user.email||typeof payload.subject!=='string'||!payload.subject.startsWith('[TEST] ')||typeof payload.html!=='string'||typeof payload.text!=='string'||!payload.headers)return finish('failed');
  if(!row.firstAttemptAt||now.getTime()-row.firstAttemptAt.getTime()>=DAY-60000)return finish('failed');
  try{
   const accepted=await gateway.send(payload,`email-test/${row.id}`);
   if(!accepted.id||accepted.id.length>256)throw new Error('Invalid acknowledgement');
   await tx.update(s.emailTestMessages).set({status:'sent',providerId:accepted.id,sentAt:now,leaseToken:null,claimUntil:null,nextAttemptAt:null}).where(and(eq(s.emailTestMessages.id,row.id),eq(s.emailTestMessages.leaseToken,claim.token)));
   return 'sent';
  }catch(error){
   const permanent=row.attemptCount>=5||!!(error&&typeof error==='object'&&'disposition' in error&&error.disposition==='permanent');
   const next=new Date(now.getTime()+Math.min(3600000,60000*2**Math.max(0,row.attemptCount-1)));
   if(permanent||next.getTime()-row.firstAttemptAt.getTime()>=DAY-60000)return finish('failed');
   await tx.update(s.emailTestMessages).set({status:'pending',leaseToken:null,claimUntil:null,nextAttemptAt:next}).where(and(eq(s.emailTestMessages.id,row.id),eq(s.emailTestMessages.leaseToken,claim.token)));return 'retry';
  }
 });
}
