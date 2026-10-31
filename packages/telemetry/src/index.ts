import { Resend } from 'resend';
import { and, eq, isNull, inArray, sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from '@labticker/database/schema';
import {recordAccountState} from '@labticker/database';

export const MAX_WEBHOOK_BYTES = 262144;
export class InvalidWebhook extends Error {}
export class RetryableWebhook extends Error {}
export interface VerifiedEvent {id:string;type:string;emailId:string;occurredAt:Date;}
const supported=new Set(['email.sent','email.delivered','email.delivery_delayed','email.bounced','email.complained','email.opened','email.clicked']);
/** Verification is local cryptography only. This SDK instance never sends API requests. */
export function verifyResendWebhook(payload:string, headers:Headers, secret:string):VerifiedEvent {
  if(Buffer.byteLength(payload)>MAX_WEBHOOK_BYTES) throw new InvalidWebhook('Payload too large');
  const id=headers.get('svix-id')??'';const timestamp=headers.get('svix-timestamp')??'';const signature=headers.get('svix-signature')??'';
  if(!id||id.length>256||!timestamp||signature.length>4096||!signature) throw new InvalidWebhook('Invalid signature headers');
  let verified:unknown;
  try { verified=new Resend('verification-only').webhooks.verify({payload,headers:{id,timestamp,signature},webhookSecret:secret}); }
  catch { throw new InvalidWebhook('Invalid webhook signature'); }
  if(!verified||typeof verified!=='object') throw new InvalidWebhook('Invalid event');
  const event=verified as Record<string,unknown>;
  const data=event.data as Record<string,unknown>|undefined;
  if(typeof event.type!=='string'||event.type.length>100||!data||typeof data.email_id!=='string'||data.email_id.length>256||!data.email_id||typeof event.created_at!=='string') throw new InvalidWebhook('Invalid event');
  const occurredAt=new Date(event.created_at);
  if(!Number.isFinite(occurredAt.getTime())) throw new InvalidWebhook('Invalid event timestamp');
  return {id,type:event.type,emailId:data.email_id,occurredAt};
}

/** Event body/recipient/link/IP data are never stored. Unmatched known events retry so a
 * webhook racing the API send acknowledgement cannot be silently lost. */
export async function processResendEvent(db:PgDatabase<PgQueryResultHKT,typeof schema>,event:VerifiedEvent,now=new Date()):Promise<'processed'|'duplicate'|'ignored'> {
  return db.transaction(async tx=>{
    const [record]=await tx.insert(schema.resendWebhookEvents).values({providerEventId:event.id,eventType:event.type,resendEmailId:event.emailId,receivedAt:now}).onConflictDoNothing().returning();
    if(!record) return 'duplicate';
    if(!supported.has(event.type)) {
      await tx.update(schema.resendWebhookEvents).set({processingStatus:'ignored',processedAt:now}).where(eq(schema.resendWebhookEvents.id,record.id));
      return 'ignored';
    }
    const [digest]=await tx.select().from(schema.digests).where(eq(schema.digests.resendId,event.emailId));
    if(!digest) throw new RetryableWebhook('Message acknowledgement not yet available');
    await tx.insert(schema.digestMessageEngagement).values({digestId:digest.id}).onConflictDoNothing();
    const [engagement]=await tx.select().from(schema.digestMessageEngagement).where(eq(schema.digestMessageEngagement.digestId,digest.id));
    if(!engagement) throw new RetryableWebhook('Engagement unavailable');
    const first=(column:typeof schema.digestMessageEngagement.deliveredAt)=>sql`least(${column}, ${event.occurredAt})`;
    if(event.type==='email.delivered') await tx.update(schema.digestMessageEngagement).set({deliveredAt:first(schema.digestMessageEngagement.deliveredAt)}).where(eq(schema.digestMessageEngagement.digestId,digest.id));
    if(event.type==='email.opened'&&engagement.trackedOpenEnabled) await tx.update(schema.digestMessageEngagement).set({firstOpenedAt:first(schema.digestMessageEngagement.firstOpenedAt)}).where(eq(schema.digestMessageEngagement.digestId,digest.id));
    if(event.type==='email.clicked'&&engagement.trackedClickEnabled) await tx.update(schema.digestMessageEngagement).set({firstClickedAt:first(schema.digestMessageEngagement.firstClickedAt)}).where(eq(schema.digestMessageEngagement.digestId,digest.id));
    if(event.type==='email.bounced'||event.type==='email.complained') {
      await tx.select({id:schema.users.id}).from(schema.users).where(eq(schema.users.id,digest.userId)).for('update');
      const changes=event.type==='email.bounced'?{bouncedAt:first(schema.digestMessageEngagement.bouncedAt)}:{complaintAt:first(schema.digestMessageEngagement.complaintAt)};
      await tx.update(schema.digestMessageEngagement).set(changes).where(eq(schema.digestMessageEngagement.digestId,digest.id));
      await tx.update(schema.users).set({suppressedAt:sql`coalesce(${schema.users.suppressedAt}, ${now})`}).where(eq(schema.users.id,digest.userId));
      await tx.update(schema.preferences).set({enabled:false,nextDueAt:null}).where(eq(schema.preferences.userId,digest.userId));
      await tx.update(schema.digests).set({status:'skipped',lastError:'Provider suppression'}).where(and(eq(schema.digests.userId,digest.userId),inArray(schema.digests.status,['pending','claimed'])));
      await tx.update(schema.emailConsents).set({withdrawnAt:now}).where(and(eq(schema.emailConsents.userId,digest.userId),eq(schema.emailConsents.consentType,'digest'),isNull(schema.emailConsents.withdrawnAt)));
      await recordAccountState(tx,digest.userId,'suppressed',now);
    }
    await tx.update(schema.resendWebhookEvents).set({processingStatus:'processed',processedAt:now}).where(eq(schema.resendWebhookEvents.id,record.id));
    return 'processed';
  });
}

export async function readWebhookBody(request:Request):Promise<string> {
  const length=request.headers.get('content-length');
  if(length&&(!/^\d+$/.test(length)||Number(length)>MAX_WEBHOOK_BYTES)) throw new InvalidWebhook('Payload too large');
  if(!request.body) throw new InvalidWebhook('Missing body');
  const reader=request.body.getReader();const chunks:Uint8Array[]=[];let bytes=0;
  try { while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>MAX_WEBHOOK_BYTES){await reader.cancel();throw new InvalidWebhook('Payload too large');}chunks.push(value);} }
  finally { reader.releaseLock(); }
  return Buffer.concat(chunks).toString('utf8');
}
