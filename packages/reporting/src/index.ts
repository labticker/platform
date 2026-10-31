import {cohortCounts} from './cohorts.js';
import {and,eq,gte,lt} from 'drizzle-orm';
import type {PgDatabase,PgQueryResultHKT} from 'drizzle-orm/pg-core';
import * as schema from '@labticker/database/schema';
import type {Metric} from './reader.js';
export {readSummary,parseSummaryQuery,createSummaryHandler,authorizedBearer} from './reader.js';
export type {SummaryQuery,Metric} from './reader.js';
/** Server/worker-only materializer. Subscriber records never enter its returned value. */
export async function materializeDaily(db:PgDatabase<PgQueryResultHKT,typeof schema>,date:string,computedAt=new Date()):Promise<void>{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||new Date(date).toISOString().slice(0,10)!==date)throw new Error('Invalid date');
 const start=new Date(date),end=new Date(start.getTime()+86400000);
 if(end>computedAt)throw new Error('Only complete UTC dates may be materialized');
 await db.transaction(async tx=>{
 const verified=await tx.select({id:schema.users.id}).from(schema.users).where(and(gte(schema.users.emailVerified,start),lt(schema.users.emailVerified,end)));
 const due=await tx.select({status:schema.digests.status}).from(schema.digests).where(and(gte(schema.digests.scheduledFor,start),lt(schema.digests.scheduledFor,end)));
 const messages=await tx.select({digest:schema.digests,engagement:schema.digestMessageEngagement}).from(schema.digests).leftJoin(schema.digestMessageEngagement,eq(schema.digests.id,schema.digestMessageEngagement.digestId)).where(and(gte(schema.digests.sentAt,start),lt(schema.digests.sentAt,end)));
 const cohortUsers=await tx.select().from(schema.users);
 const history=await tx.select().from(schema.accountStateEvents);
 const cohorts=cohortCounts(cohortUsers,history,start,end,computedAt);
 const count=(test:(r:typeof messages[number])=>boolean)=>messages.filter(test).length;
 const values:Record<Metric,number>={verified_signups:verified.length,activation_eligible:cohorts.activationEligible,activated_three_monitors:cohorts.activated,retention_eligible:cohorts.retentionEligible,retained_day30:cohorts.retained,cohort_unmeasured:cohorts.unmeasured,digest_due:due.filter(r=>r.status!=='skipped').length,digest_accepted:messages.length,digest_delivered:count(r=>!!r.engagement?.deliveredAt),digest_bounced:count(r=>!!r.engagement?.bouncedAt),digest_complained:count(r=>!!r.engagement?.complaintAt),digest_tracked_open_delivered:count(r=>!!r.engagement?.deliveredAt&&r.engagement.trackedOpenEnabled),digest_reported_open_estimated:count(r=>!!r.engagement?.deliveredAt&&r.engagement.trackedOpenEnabled&&!!r.engagement.firstOpenedAt),digest_tracked_click_delivered:count(r=>!!r.engagement?.deliveredAt&&r.engagement.trackedClickEnabled),digest_reported_click:count(r=>!!r.engagement?.deliveredAt&&r.engagement.trackedClickEnabled&&!!r.engagement.firstClickedAt)};
 for(const [metricName,metricValue] of Object.entries(values))await tx.insert(schema.analyticsDailyAggregates).values({metricDate:date,metricName,dimensionKey:'all',metricValue,computedAt}).onConflictDoUpdate({target:[schema.analyticsDailyAggregates.metricDate,schema.analyticsDailyAggregates.metricName,schema.analyticsDailyAggregates.dimensionKey],set:{metricValue,computedAt}});
 await tx.insert(schema.analyticsReportRuns).values({fromDate:date,toDate:date,status:'completed',sourceWatermark:computedAt,completedAt:computedAt});
 });
}

