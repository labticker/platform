import type {InferSelectModel} from 'drizzle-orm';
import type {accountStateEvents,users} from '@labticker/database/schema';
type State=InferSelectModel<typeof accountStateEvents>;type User=InferSelectModel<typeof users>;
/** Cohorts only include users with an authoritative baseline at verification.
 * Pre-instrumentation histories are excluded, never reconstructed from today's state.
 */
export function cohortCounts(accounts:readonly User[],history:readonly State[],start:Date,end:Date,asOf:Date){
 let activationEligible=0,activated=0,retentionEligible=0,retained=0,unmeasured=0;
 for(const user of accounts){const verified=user.emailVerified;if(!verified||verified<start||verified>=end)continue;
 const events=history.filter(e=>e.userId===user.id&&e.occurredAt<=asOf).sort((a,b)=>a.occurredAt.getTime()-b.occurredAt.getTime()||a.sequence-b.sequence);
 if(!events.some(e=>e.eventType==='verified_signup'&&e.occurredAt.getTime()===verified.getTime())){unmeasured++;continue;}
 const activationAt=new Date(verified.getTime()+7*86400000),retentionAt=new Date(verified.getTime()+30*86400000);
 if(activationAt<=asOf){activationEligible++;if(events.some(e=>e.occurredAt>=verified&&e.occurredAt<=activationAt&&e.activeMonitorCount>=3))activated++;}
 if(retentionAt<=asOf){retentionEligible++;const state=events.filter(e=>e.occurredAt<=retentionAt).at(-1);if(state&&state.consented&&state.enabled&&!state.suppressed&&state.activeMonitorCount>=1)retained++;}
 }
 return {activationEligible,activated,retentionEligible,retained,unmeasured};
}
/** UTC account-day withdrawal cohort. Generic historical suppression is never
 * reclassified as an unsubscribe; provider bounces/complaints are separate events.
 */
export function unsubscribeCounts(accounts:readonly User[],history:readonly State[],start:Date,end:Date){
 const intents=new Set<string>(),risk=new Set<string>(),withdrawals=new Set<string>(),unclassified=new Set<string>();
 for(const user of accounts){
  if(!user.emailVerified||user.emailVerified>=end)continue;
  const events=history.filter(e=>e.userId===user.id&&e.occurredAt<end).sort((a,b)=>a.occurredAt.getTime()-b.occurredAt.getTime()||a.sequence-b.sequence);
  const eligible=(event:State|undefined)=>!!event&&event.consented&&event.enabled&&!event.suppressed;
  let prior=events.filter(e=>e.occurredAt<start).at(-1);if(eligible(prior))risk.add(user.id);
  for(const event of events.filter(e=>e.occurredAt>=start)){
   if(event.eventType==='unsubscribe_completed'||event.eventType==='digest_consent_withdrawn'){
    intents.add(user.id);if(risk.has(user.id))withdrawals.add(user.id);
   }
   if(event.eventType==='suppressed')unclassified.add(user.id);
   if(eligible(event))risk.add(user.id);prior=event;
  }
 }
 return {accounts:intents.size,atRisk:risk.size,fromAtRisk:withdrawals.size,unclassified:unclassified.size};
}

