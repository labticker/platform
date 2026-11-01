import {and,eq,isNull,isNotNull,gte,lt} from 'drizzle-orm';
import type {PgDatabase,PgQueryResultHKT} from 'drizzle-orm/pg-core';
import * as schema from './schema.js';
import {recordAccountState} from './history.js';
/** Successful provider verification and cohort baseline commit atomically. Retried
 * logins can recover a missing baseline without moving the original signup date. */
export async function recordSuccessfulSignIn(db:PgDatabase<PgQueryResultHKT,typeof schema>,userId:string,verifiedGithub:boolean,now=new Date(),makeAdmin=false){
 return db.transaction(async tx=>{
  const [user]=await tx.select().from(schema.users).where(and(eq(schema.users.id,userId),isNull(schema.users.deletedAt))).for('update');
  if(!user)throw new Error('Verified account required');
  const verifiedAt=user.emailVerified??(verifiedGithub?now:null);
  if(!verifiedAt)throw new Error('Verified account required');
  if(!user.emailVerified)await tx.update(schema.users).set({emailVerified:verifiedAt}).where(eq(schema.users.id,user.id));
  if(makeAdmin&&verifiedGithub&&user.role!=='admin')await tx.update(schema.users).set({role:'admin'}).where(eq(schema.users.id,user.id));
  await recordAccountState(tx,user.id,'verified_signup',verifiedAt);
  await recordAccountState(tx,user.id,'dashboard_login',now);
 });
}
/** At most one authenticated dashboard visit per UTC day. No URL or device data. */
export async function recordDashboardVisit(db:PgDatabase<PgQueryResultHKT,typeof schema>,userId:string,now=new Date()){
 const start=new Date(now.toISOString().slice(0,10)),end=new Date(start.getTime()+86400000);
 await db.transaction(async tx=>{
  const [user]=await tx.select({id:schema.users.id}).from(schema.users).where(and(eq(schema.users.id,userId),isNull(schema.users.deletedAt),isNotNull(schema.users.emailVerified))).for('update');
  if(!user)throw new Error('Verified account required');
  const [prior]=await tx.select({id:schema.accountStateEvents.id}).from(schema.accountStateEvents).where(and(eq(schema.accountStateEvents.userId,userId),eq(schema.accountStateEvents.eventType,'dashboard_view'),gte(schema.accountStateEvents.occurredAt,start),lt(schema.accountStateEvents.occurredAt,end))).limit(1);
  if(!prior)await recordAccountState(tx,userId,'dashboard_view',now);
 });
}
