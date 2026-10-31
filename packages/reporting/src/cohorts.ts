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

