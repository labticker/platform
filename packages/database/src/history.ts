import {and,eq,isNull} from 'drizzle-orm';
import type {PgDatabase,PgQueryResultHKT} from 'drizzle-orm/pg-core';
import * as schema from './schema.js';
/** Invoke within the same transaction as every authoritative state mutation. */
export async function recordAccountState(db:PgDatabase<PgQueryResultHKT,typeof schema>,userId:string,eventType:string,occurredAt=new Date()):Promise<void>{
 if(eventType==='verified_signup'){const prior=await db.select({id:schema.accountStateEvents.id}).from(schema.accountStateEvents).where(and(eq(schema.accountStateEvents.userId,userId),eq(schema.accountStateEvents.eventType,eventType)));if(prior.length)return;}
 const [user]=await db.select().from(schema.users).where(eq(schema.users.id,userId));if(!user)throw new Error('Account not found');
 const [preference]=await db.select().from(schema.preferences).where(eq(schema.preferences.userId,userId));
 const monitors=await db.select({id:schema.subscriptions.applicationId}).from(schema.subscriptions).where(and(eq(schema.subscriptions.userId,userId),eq(schema.subscriptions.active,true)));
 const consents=await db.select({id:schema.emailConsents.id}).from(schema.emailConsents).where(and(eq(schema.emailConsents.userId,userId),eq(schema.emailConsents.consentType,'digest'),isNull(schema.emailConsents.withdrawnAt)));
 await db.insert(schema.accountStateEvents).values({userId,eventType,occurredAt,activeMonitorCount:monitors.length,consented:consents.length>0,enabled:preference?.enabled??false,suppressed:!!user.suppressedAt||!!user.deletedAt});
}

