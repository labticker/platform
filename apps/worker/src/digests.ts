import {randomUUID} from 'node:crypto';
import {and,eq,lte,or,isNull,inArray,asc} from 'drizzle-orm';
import type {PgDatabase,PgQueryResultHKT} from 'drizzle-orm/pg-core';
import * as s from '@labticker/database/schema';
import {assertMockDelivery,composeDigest,eligibleReleases,nextDigestAt,signUnsubscribe} from '@labticker/notifications';
import type {DigestRelease,EmailGateway,EmailMessage} from '@labticker/notifications';

type Database=PgDatabase<PgQueryResultHKT,typeof s>;
export interface DigestQueueConfig {
 origin:string;unsubscribeSecret:string;senderIdentity:string;senderContact:string;
 mode?:string;publicEmailEnabled?:boolean;leaseMs?:number;maxAttempts?:number;
}
export interface DigestClaim {id:string;userId:string;leaseToken:string;}
export type PreparationResult={status:'idle'|'queued'|'skipped';items:number;id?:string};
const DAY=86400000;
const reservedStatuses=['pending','claimed','failed','sent'];
function checkConfig(config:DigestQueueConfig){
 assertMockDelivery(config);
 if(config.leaseMs!==undefined&&(!Number.isSafeInteger(config.leaseMs)||config.leaseMs<1000||config.leaseMs>900000))throw new Error('Invalid lease duration');
 if(config.maxAttempts!==undefined&&(!Number.isInteger(config.maxAttempts)||config.maxAttempts<1||config.maxAttempts>10))throw new Error('Invalid attempt limit');
}
function labels(value:unknown):string[]{return Array.isArray(value)?value.flatMap(v=>v&&typeof v==='object'&&'label' in v&&typeof v.label==='string'?[v.label.slice(0,240)]:[]):[];}

/** One due account per transaction. All account operations lock users before related rows. */
export async function prepareDueDigest(db:Database,config:DigestQueueConfig,now=new Date()):Promise<PreparationResult>{
 checkConfig(config);
 return db.transaction(async tx=>{
  const [candidate]=await tx.select({user:s.users,preference:s.preferences}).from(s.users)
   .innerJoin(s.preferences,eq(s.preferences.userId,s.users.id))
   .where(and(eq(s.preferences.enabled,true),lte(s.preferences.nextDueAt,now),isNull(s.users.suppressedAt),isNull(s.users.deletedAt)))
   .orderBy(asc(s.preferences.nextDueAt)).limit(1).for('update',{of:s.users,skipLocked:true});
  if(!candidate)return {status:'idle',items:0};
  const user=candidate.user;
  // Re-read after the user lock; account mutations serialize on that lock too.
  const [preference]=await tx.select().from(s.preferences).where(eq(s.preferences.userId,user.id));
  if(!preference?.enabled||!preference.nextDueAt||preference.nextDueAt>now)return {status:'idle',items:0};
  const consent=await tx.select({id:s.emailConsents.id}).from(s.emailConsents).where(and(eq(s.emailConsents.userId,user.id),eq(s.emailConsents.consentType,'digest'),isNull(s.emailConsents.withdrawnAt)));
  const subscriptions=await tx.select().from(s.subscriptions).where(eq(s.subscriptions.userId,user.id));
  const receipts=await tx.select({id:s.deliveryReceipts.releaseId}).from(s.deliveryReceipts).where(eq(s.deliveryReceipts.userId,user.id));
  const reserved=await tx.select({id:s.digestItems.releaseId}).from(s.digestItems).innerJoin(s.digests,eq(s.digestItems.digestId,s.digests.id))
   .where(and(eq(s.digests.userId,user.id),inArray(s.digests.status,reservedStatuses)));
  const excluded=new Set([...receipts,...reserved].map(r=>r.id));
  const rows=await tx.select({release:s.releases,app:s.applications}).from(s.releases)
   .innerJoin(s.applications,eq(s.applications.id,s.releases.applicationId))
   .innerJoin(s.subscriptions,and(eq(s.subscriptions.applicationId,s.releases.applicationId),eq(s.subscriptions.userId,user.id),eq(s.subscriptions.active,true)))
   .where(and(eq(s.releases.isBackfill,false),lte(s.releases.firstSeenAt,now),eq(s.applications.isActive,true),eq(s.applications.hidden,false)));
  const releases:DigestRelease[]=rows.map(({release:r,app})=>({id:r.id,appId:r.applicationId,appName:app.name,title:r.title,version:r.tag??'',releaseUrl:r.releaseUrl,notes:r.notesText,firstSeenAt:r.firstSeenAt,publishedAt:r.publishedAt,isBackfill:r.isBackfill,warnings:labels(r.warningFlags)}));
  const unseen=eligibleReleases({verified:!!user.emailVerified,consented:consent.length>0,enabled:preference.enabled,suppressed:!!user.suppressedAt||!!user.deletedAt,subscriptions:subscriptions.map(subscription=>({appId:subscription.applicationId,enabledAt:subscription.enabledAt,active:subscription.active}))},releases,excluded,now);
  const eligible=unseen.slice(0,100);
  const id=randomUUID();
  const payload=eligible.length?composeDigest({to:user.email,releases:eligible,origin:config.origin,unsubscribeToken:signUnsubscribe(user.id,new Date(now.getTime()+365*DAY),config.unsubscribeSecret),senderIdentity:config.senderIdentity,senderContact:config.senderContact}):null;
  const [digest]=await tx.insert(s.digests).values({id,userId:user.id,scheduledFor:preference.nextDueAt,windowFrom:new Date(Math.min(now.getTime(),user.createdAt.getTime(),...eligible.map(release=>release.firstSeenAt.getTime()))),windowTo:now,status:payload?'pending':'skipped',idempotencyKey:`digest/${id}`,payload}).onConflictDoNothing({target:[s.digests.userId,s.digests.scheduledFor]}).returning();
  if(digest&&payload)await tx.insert(s.digestItems).values(eligible.map(release=>({digestId:id,releaseId:release.id,snapshot:release})));
  // Preparation never records delivery. Advancing the schedule does not exclude unseen
  // releases: reservations/receipts and enabledAt determine eligibility. Ordinary
  // outages never expire unseen history. Overflow drains in distinct minute windows,
  // rather than waiting a full weekly cadence and silently aging out a backlog.
  await tx.update(s.preferences).set({nextDueAt:unseen.length>100?new Date(now.getTime()+60000):nextDigestAt(now,preference.frequency as 'daily'|'weekly',preference.timezone),lastDigestEndAt:now}).where(eq(s.preferences.userId,user.id));
  return {status:digest&&payload?'queued':'skipped',items:digest&&payload?eligible.length:0,...(digest?{id:digest.id}:{})};
 });
}

/** Persist a fenced lease before dispatch so crash recovery reuses the exact payload/key. */
export async function claimDigest(db:Database,config:DigestQueueConfig,now=new Date()):Promise<DigestClaim|null>{
 checkConfig(config);
 return db.transaction(async tx=>{
  const [candidate]=await tx.select({id:s.digests.id,userId:s.digests.userId}).from(s.users).innerJoin(s.digests,eq(s.digests.userId,s.users.id))
   .where(and(or(and(eq(s.digests.status,'pending'),or(isNull(s.digests.nextAttemptAt),lte(s.digests.nextAttemptAt,now))),and(eq(s.digests.status,'claimed'),lte(s.digests.claimUntil,now)))))
   .orderBy(asc(s.digests.scheduledFor)).limit(1).for('update',{of:s.users,skipLocked:true});
  if(!candidate)return null;
  const [digest]=await tx.select().from(s.digests).where(eq(s.digests.id,candidate.id)).for('update',{skipLocked:true});
  if(!digest||!['pending','claimed'].includes(digest.status)||digest.status==='claimed'&&(!digest.claimUntil||digest.claimUntil>now)||digest.status==='pending'&&digest.nextAttemptAt&&digest.nextAttemptAt>now)return null;
  if(digest.attemptCount>=(config.maxAttempts??5)||digest.firstAttemptAt&&now.getTime()-digest.firstAttemptAt.getTime()>=DAY){
   await tx.update(s.digests).set({status:'failed',leaseToken:null,claimUntil:null,nextAttemptAt:null,lastError:'Manual reconciliation required; retry safety window or attempts exhausted'}).where(eq(s.digests.id,digest.id));return null;
  }
  const leaseToken=randomUUID();
  await tx.update(s.digests).set({status:'claimed',leaseToken,claimUntil:new Date(now.getTime()+(config.leaseMs??120000)),firstAttemptAt:digest.firstAttemptAt??now,attemptCount:digest.attemptCount+1,nextAttemptAt:null}).where(eq(s.digests.id,digest.id));
  return {id:digest.id,userId:digest.userId,leaseToken};
 });
}
function message(value:unknown):EmailMessage|null{
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const row=value as Record<string,unknown>;
 if(['to','subject','html','text'].some(key=>typeof row[key]!=='string')||!row.headers||typeof row.headers!=='object'||Array.isArray(row.headers))return null;
 if(Object.entries(row.headers).some(([key,v])=>typeof v!=='string'||/[\r\n]/.test(key+v)))return null;
 return row as unknown as EmailMessage;
}
export type DispatchResult='idle'|'sent'|'skipped'|'retry'|'failed'|'stale';
/** Hold user/digest locks during bounded dispatch: consent changes either precede sending,
 * or commit after an already accepted operation. No claim can be concurrently reclaimed.
 * Callers must provide a bounded gateway. Runtime wiring uses only the local mock gateway.
 */
export async function deliverClaim(db:Database,claim:DigestClaim,gateway:EmailGateway,config:DigestQueueConfig,now=new Date()):Promise<DispatchResult>{
 checkConfig(config);
 return db.transaction(async tx=>{
  const [user]=await tx.select().from(s.users).where(eq(s.users.id,claim.userId)).for('update');
  const [digest]=await tx.select().from(s.digests).where(eq(s.digests.id,claim.id)).for('update');
  if(!user||!digest||digest.userId!==user.id||digest.status!=='claimed'||digest.leaseToken!==claim.leaseToken||!digest.claimUntil||digest.claimUntil<=now)return 'stale';
  if(digest.firstAttemptAt&&now.getTime()-digest.firstAttemptAt.getTime()>=DAY){await tx.update(s.digests).set({status:'failed',leaseToken:null,claimUntil:null,nextAttemptAt:null,lastError:'Manual reconciliation required; retry safety window expired'}).where(eq(s.digests.id,digest.id));return 'failed';}
  const skip=async(reason:string):Promise<DispatchResult>=>{
   // A committed claim is conservatively a possible dispatch. Releasing its item
   // reservations could send an ambiguously accepted release under a new key.
   const status=digest.firstAttemptAt?'failed':'skipped';
   await tx.update(s.digests).set({status,leaseToken:null,claimUntil:null,nextAttemptAt:null,lastError:digest.firstAttemptAt?'Manual reconciliation required after eligibility changed':reason}).where(eq(s.digests.id,digest.id));return status;
  };
  const [preference]=await tx.select().from(s.preferences).where(eq(s.preferences.userId,user.id));
  const consent=await tx.select({id:s.emailConsents.id}).from(s.emailConsents).where(and(eq(s.emailConsents.userId,user.id),eq(s.emailConsents.consentType,'digest'),isNull(s.emailConsents.withdrawnAt)));
  if(!user.emailVerified||user.suppressedAt||user.deletedAt||!preference?.enabled||!consent.length)return skip('Account is no longer eligible');
  const payload=message(digest.payload);
  if(!payload||payload.to!==user.email)return skip('Stored message is no longer eligible');
  const items=await tx.select({release:s.releases,app:s.applications}).from(s.digestItems)
   .innerJoin(s.releases,eq(s.releases.id,s.digestItems.releaseId)).innerJoin(s.applications,eq(s.applications.id,s.releases.applicationId)).where(eq(s.digestItems.digestId,digest.id));
  if(!items.length)return skip('Empty digest');
  const subscriptions=await tx.select().from(s.subscriptions).where(eq(s.subscriptions.userId,user.id));
  const delivered=await tx.select({id:s.deliveryReceipts.releaseId}).from(s.deliveryReceipts).where(and(eq(s.deliveryReceipts.userId,user.id),inArray(s.deliveryReceipts.releaseId,items.map(item=>item.release.id))));
  if(delivered.length||items.some(({release:r,app})=>r.isBackfill||!app.isActive||app.hidden||!subscriptions.some(subscription=>subscription.applicationId===r.applicationId&&subscription.active&&subscription.enabledAt<r.firstSeenAt)))return skip('Digest selections changed; prepare remaining unseen releases again');
  let accepted:{id:string};
  try{accepted=await gateway.send(payload,digest.idempotencyKey);if(!accepted.id||accepted.id.length>256)throw new Error('Invalid provider acknowledgement');}
  catch(error){
   const disposition=error&&typeof error==='object'&&'disposition' in error?error.disposition:undefined;
   const permanent=disposition==='permanent'||digest.attemptCount>=(config.maxAttempts??5);
   await tx.update(s.digests).set({status:permanent?'failed':'pending',leaseToken:null,claimUntil:null,nextAttemptAt:permanent?null:new Date(now.getTime()+Math.min(3600000,60000*2**Math.max(0,digest.attemptCount-1))),lastError:permanent?'Delivery requires manual review':'Delivery not confirmed; retry with unchanged payload and key'}).where(eq(s.digests.id,digest.id));
   return permanent?'failed':'retry';
  }
  await tx.insert(s.deliveryReceipts).values(items.map(({release})=>({userId:user.id,releaseId:release.id,digestId:digest.id,resendId:accepted.id,acceptedAt:now})));
  await tx.insert(s.digestMessageEngagement).values({digestId:digest.id,trackedOpenEnabled:false,trackedClickEnabled:false}).onConflictDoNothing();
  await tx.update(s.digests).set({status:'sent',resendId:accepted.id,sentAt:now,leaseToken:null,claimUntil:null,nextAttemptAt:null,lastError:null}).where(eq(s.digests.id,digest.id));
  return 'sent';
 });
}
export async function sendOneDigest(db:Database,gateway:EmailGateway,config:DigestQueueConfig,now=new Date()):Promise<DispatchResult>{
 const claim=await claimDigest(db,config,now);return claim?deliverClaim(db,claim,gateway,config,now):'idle';
}
