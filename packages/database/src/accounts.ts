import {and,eq,isNull,inArray,desc,sql} from 'drizzle-orm';
import type {PgDatabase,PgQueryResultHKT} from 'drizzle-orm/pg-core';
import * as s from './schema.js';
import {recordAccountState} from './history.js';
type Database=PgDatabase<PgQueryResultHKT,typeof s>;
export async function accountDashboard(db:Database,userId:string){
 const [user]=await db.select().from(s.users).where(and(eq(s.users.id,userId),isNull(s.users.deletedAt)));
 if(!user?.emailVerified) throw new Error('Verified account required');
 const apps=await db.select({id:s.applications.id,name:s.applications.name,slug:s.applications.slug,category:s.applications.category,status:s.applications.status}).from(s.applications).where(and(eq(s.applications.isActive,true),eq(s.applications.hidden,false)));
 const monitors=await db.select().from(s.subscriptions).where(eq(s.subscriptions.userId,userId));
 const [preferences]=await db.select().from(s.preferences).where(eq(s.preferences.userId,userId));
 const [consent]=await db.select({id:s.emailConsents.id}).from(s.emailConsents).where(and(eq(s.emailConsents.userId,userId),eq(s.emailConsents.consentType,'digest'),isNull(s.emailConsents.withdrawnAt)));
 const recent=await db.select({title:s.releases.title,tag:s.releases.tag,url:s.releases.releaseUrl,appName:s.applications.name,slug:s.applications.slug,notes:sql<string>`left(${s.releases.notesText},600)`,publishedAt:s.releases.publishedAt,firstSeenAt:s.releases.firstSeenAt,backfill:s.releases.isBackfill,warnings:s.releases.warningFlags}).from(s.releases).innerJoin(s.applications,eq(s.applications.id,s.releases.applicationId)).innerJoin(s.subscriptions,and(eq(s.subscriptions.applicationId,s.releases.applicationId),eq(s.subscriptions.userId,userId),eq(s.subscriptions.active,true))).where(eq(s.applications.hidden,false)).orderBy(desc(s.releases.firstSeenAt)).limit(25);
 return {apps,monitors,preferences,recent,consented:!!consent,suppressed:!!user.suppressedAt};
}
export async function setMonitor(db:Database,userId:string,applicationId:string,active:boolean,now=new Date()){
 await db.transaction(async tx=>{
  const [user]=await tx.select().from(s.users).where(and(eq(s.users.id,userId),isNull(s.users.deletedAt))).for('update');
  if(!user?.emailVerified) throw new Error('Verified account required');
  const [app]=await tx.select().from(s.applications).where(and(eq(s.applications.id,applicationId),eq(s.applications.isActive,true),eq(s.applications.hidden,false)));
  if(!app) throw new Error('Application unavailable');
  const [source]=await tx.select().from(s.releaseSources).where(and(eq(s.releaseSources.applicationId,applicationId),eq(s.releaseSources.enabled,true)));
  if(active&&!source) throw new Error('No supported release source');
  const [old]=await tx.select().from(s.subscriptions).where(and(eq(s.subscriptions.userId,userId),eq(s.subscriptions.applicationId,applicationId)));
  if(old?.active===active) return;
  if(old) await tx.update(s.subscriptions).set({active,...(active?{enabledAt:now,disabledAt:null}:{disabledAt:now})}).where(and(eq(s.subscriptions.userId,userId),eq(s.subscriptions.applicationId,applicationId)));
  else if(active) await tx.insert(s.subscriptions).values({userId,applicationId,enabledAt:now,active:true,createdAt:now});
  await recordAccountState(tx,userId,active?'monitor_added':'monitor_removed',now);
 });
}
export async function savePreferences(db:Database,userId:string,input:{frequency:'daily'|'weekly';timezone:string;enabled:boolean;consent:boolean;nextDueAt:Date},now=new Date()){
 if(!['daily','weekly'].includes(input.frequency)) throw new Error('Invalid frequency');
 new Intl.DateTimeFormat('en',{timeZone:input.timezone}).format(now);
 if(!Number.isFinite(input.nextDueAt.getTime())||input.nextDueAt<=now) throw new Error('Invalid next due time');
 await db.transaction(async tx=>{
  const [user]=await tx.select().from(s.users).where(and(eq(s.users.id,userId),isNull(s.users.deletedAt))).for('update');
  if(!user?.emailVerified) throw new Error('Verified account required');
  if(input.enabled&&(!input.consent||user.suppressedAt)) throw new Error('Consent and unsuppressed account required');
  await tx.insert(s.preferences).values({userId,frequency:input.frequency,timezone:input.timezone,enabled:input.enabled,nextDueAt:input.nextDueAt}).onConflictDoUpdate({target:s.preferences.userId,set:{frequency:input.frequency,timezone:input.timezone,enabled:input.enabled,nextDueAt:input.nextDueAt}});
  const [consent]=await tx.select().from(s.emailConsents).where(and(eq(s.emailConsents.userId,userId),eq(s.emailConsents.consentType,'digest'),isNull(s.emailConsents.withdrawnAt)));
  if(input.consent&&!consent) await tx.insert(s.emailConsents).values({userId,consentType:'digest',policyVersion:'digest-v1',consentedAt:now,source:'settings'});
  if(!input.consent) await tx.update(s.emailConsents).set({withdrawnAt:now}).where(and(eq(s.emailConsents.userId,userId),isNull(s.emailConsents.withdrawnAt)));
  if(!input.consent&&consent) await recordAccountState(tx,userId,'digest_consent_withdrawn',now);
  await recordAccountState(tx,userId,'preferences_updated',now);
  if(!input.enabled||!input.consent) await tx.update(s.digests).set({status:sql`case when ${s.digests.firstAttemptAt} is null then 'skipped' else 'failed' end`,leaseToken:null,claimUntil:null,nextAttemptAt:null,lastError:'Preference paused or consent withdrawn'}).where(and(eq(s.digests.userId,userId),inArray(s.digests.status,['pending','claimed'])));

 });
}
export async function suppressAccount(db:Database,userId:string,now=new Date()){
 await db.transaction(async tx=>{
  await tx.select({id:s.users.id}).from(s.users).where(eq(s.users.id,userId)).for('update');
  await tx.update(s.users).set({suppressedAt:now}).where(and(eq(s.users.id,userId),isNull(s.users.suppressedAt)));
  await tx.update(s.preferences).set({enabled:false}).where(eq(s.preferences.userId,userId));
  await tx.update(s.emailConsents).set({withdrawnAt:now}).where(and(eq(s.emailConsents.userId,userId),isNull(s.emailConsents.withdrawnAt)));
  await tx.update(s.digests).set({status:sql`case when ${s.digests.firstAttemptAt} is null then 'skipped' else 'failed' end`,leaseToken:null,claimUntil:null,nextAttemptAt:null,lastError:'Unsubscribed'}).where(and(eq(s.digests.userId,userId),inArray(s.digests.status,['pending','claimed'])));
  await recordAccountState(tx,userId,'unsubscribe_completed',now);
 });
}
/** Remove contact/auth/profile data; retain pseudonymous compliance and delivery receipts. */
export async function deleteAccount(db:Database,userId:string,now=new Date()){
 await db.transaction(async tx=>{
  const [user]=await tx.select().from(s.users).where(eq(s.users.id,userId)).for('update');if(!user)return;
  await tx.update(s.users).set({email:`${userId}@deleted.invalid`,name:null,image:null,role:'user',deletedAt:now,suppressedAt:now}).where(eq(s.users.id,userId));
  await tx.delete(s.authSessions).where(eq(s.authSessions.userId,userId));
  await tx.delete(s.authAccounts).where(eq(s.authAccounts.userId,userId));
  await tx.delete(s.verificationTokens).where(eq(s.verificationTokens.identifier,user.email));
  await tx.delete(s.preferences).where(eq(s.preferences.userId,userId));
  await tx.delete(s.subscriptions).where(eq(s.subscriptions.userId,userId));
  await tx.update(s.emailConsents).set({withdrawnAt:now}).where(and(eq(s.emailConsents.userId,userId),isNull(s.emailConsents.withdrawnAt)));
  await tx.update(s.digests).set({payload:null}).where(eq(s.digests.userId,userId));
  await tx.update(s.digests).set({status:sql`case when ${s.digests.firstAttemptAt} is null then 'skipped' else 'failed' end`,leaseToken:null,claimUntil:null,nextAttemptAt:null,lastError:'Account deleted'}).where(and(eq(s.digests.userId,userId),inArray(s.digests.status,['pending','claimed'])));
  await recordAccountState(tx,userId,'account_deleted',now);
 });
}



