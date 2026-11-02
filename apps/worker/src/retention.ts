import {and,eq,lt,or,inArray,isNotNull} from 'drizzle-orm';
import type {PgDatabase,PgQueryResultHKT} from 'drizzle-orm/pg-core';
import * as s from '@labticker/database/schema';
/** Bounded housekeeping. Retry/quarantined payloads remain immutable for reconciliation. */
export async function pruneOperationalData(db:PgDatabase<PgQueryResultHKT,typeof s>,now=new Date()){
 return db.transaction(async tx=>{
  const payloadCutoff=new Date(now.getTime()-30*86400000),webhookCutoff=new Date(now.getTime()-14*86400000);
  const messages=await tx.select({id:s.digests.id}).from(s.digests).where(and(isNotNull(s.digests.payload),or(and(eq(s.digests.status,'sent'),lt(s.digests.sentAt,payloadCutoff)),and(eq(s.digests.status,'skipped'),lt(s.digests.windowTo,payloadCutoff))))).limit(100).for('update',{skipLocked:true});
  if(messages.length)await tx.update(s.digests).set({payload:null}).where(inArray(s.digests.id,messages.map(m=>m.id)));
  const emailTests=await tx.select({id:s.emailTestMessages.id}).from(s.emailTestMessages).where(and(inArray(s.emailTestMessages.status,['sent','skipped']),lt(s.emailTestMessages.createdAt,payloadCutoff))).limit(100).for('update',{skipLocked:true});
  if(emailTests.length)await tx.delete(s.emailTestMessages).where(inArray(s.emailTestMessages.id,emailTests.map(row=>row.id)));
  // Completed ledger rows are immutable. Concurrent cleanup deletes are harmless;
  // SELECT FOR UPDATE would unnecessarily require UPDATE privilege on this table.
  const events=await tx.select({id:s.resendWebhookEvents.id}).from(s.resendWebhookEvents).where(and(inArray(s.resendWebhookEvents.processingStatus,['processed','ignored']),lt(s.resendWebhookEvents.receivedAt,webhookCutoff),lt(s.resendWebhookEvents.processedAt,webhookCutoff))).limit(1000);
  if(events.length)await tx.delete(s.resendWebhookEvents).where(inArray(s.resendWebhookEvents.id,events.map(e=>e.id)));
  const auth=await tx.select({id:s.authEmailMessages.providerId}).from(s.authEmailMessages).where(lt(s.authEmailMessages.acceptedAt,webhookCutoff)).limit(1000);
  if(auth.length)await tx.delete(s.authEmailMessages).where(inArray(s.authEmailMessages.providerId,auth.map(e=>e.id)));
  return {payloadsCleared:messages.length,webhooksPruned:events.length,authenticationAcksPruned:auth.length};
 });
}
