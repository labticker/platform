import {cohortCounts,unsubscribeCounts} from './cohorts.js';
import {and,eq,gte,lt} from 'drizzle-orm';
import type {PgDatabase,PgQueryResultHKT} from 'drizzle-orm/pg-core';
import * as schema from '@labticker/database/schema';
import type {Metric} from './reader.js';
export {readSummary,readOwnerSummary,parseSummaryQuery,createSummaryHandler,authorizedBearer} from './reader.js';
export type {SummaryQuery,Metric} from './reader.js';
/** Server/worker-only materializer. Subscriber records never enter its returned value. */
export async function materializeDaily(db:PgDatabase<PgQueryResultHKT,typeof schema>,date:string,computedAt=new Date()):Promise<void>{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||new Date(date).toISOString().slice(0,10)!==date)throw new Error('Invalid date');
 const start=new Date(date),end=new Date(start.getTime()+86400000);
 if(end>computedAt)throw new Error('Only complete UTC dates may be materialized');
 await db.transaction(async tx=>{
 const verified=await tx.select({id:schema.users.id}).from(schema.users).where(and(gte(schema.users.emailVerified,start),lt(schema.users.emailVerified,end)));
 const due=await tx.selectDistinct({id:schema.digests.id,status:schema.digests.status,sentAt:schema.digests.sentAt}).from(schema.digests).innerJoin(schema.digestItems,eq(schema.digestItems.digestId,schema.digests.id)).where(and(gte(schema.digests.scheduledFor,start),lt(schema.digests.scheduledFor,end)));
 const messages=await tx.select({digest:schema.digests,engagement:schema.digestMessageEngagement}).from(schema.digests).leftJoin(schema.digestMessageEngagement,eq(schema.digests.id,schema.digestMessageEngagement.digestId)).where(and(gte(schema.digests.sentAt,start),lt(schema.digests.sentAt,end)));
 const cohortUsers=await tx.select().from(schema.users);
 const history=await tx.select().from(schema.accountStateEvents);
 const cohorts=cohortCounts(cohortUsers,history,start,end,computedAt);
 const withdrawals=unsubscribeCounts(cohortUsers,history,start,end);
 const count=(test:(r:typeof messages[number])=>boolean)=>messages.filter(test).length;
 const observed=(date:Date|null|undefined)=>!!date&&date<=computedAt;
 const values:Partial<Record<Metric,number>>={verified_signups:verified.length,activation_eligible:cohorts.activationEligible,activated_three_monitors:cohorts.activated,retention_eligible:cohorts.retentionEligible,retained_day30:cohorts.retained,cohort_unmeasured:cohorts.unmeasured,digest_due:due.length,digest_due_accepted:due.filter(r=>r.status==='sent'&&observed(r.sentAt)).length,digest_accepted:messages.length,digest_delivered:count(r=>observed(r.engagement?.deliveredAt)),digest_bounced:count(r=>observed(r.engagement?.bouncedAt)),digest_complained:count(r=>observed(r.engagement?.complaintAt)),digest_tracked_open_delivered:count(r=>observed(r.engagement?.deliveredAt)&&!!r.engagement?.trackedOpenEnabled),digest_reported_open_estimated:count(r=>observed(r.engagement?.deliveredAt)&&!!r.engagement?.trackedOpenEnabled&&observed(r.engagement?.firstOpenedAt)),digest_tracked_click_delivered:count(r=>observed(r.engagement?.deliveredAt)&&!!r.engagement?.trackedClickEnabled),digest_reported_click:count(r=>observed(r.engagement?.deliveredAt)&&!!r.engagement?.trackedClickEnabled&&observed(r.engagement?.firstClickedAt)),unsubscribe_accounts:withdrawals.accounts,unsubscribe_at_risk:withdrawals.atRisk,unsubscribe_from_at_risk:withdrawals.fromAtRisk,suppression_unclassified_accounts:withdrawals.unclassified};
 for(const [metricName,metricValue] of Object.entries(values))await tx.insert(schema.analyticsDailyAggregates).values({metricDate:date,metricName,dimensionKey:'all',metricValue,computedAt}).onConflictDoUpdate({target:[schema.analyticsDailyAggregates.metricDate,schema.analyticsDailyAggregates.metricName,schema.analyticsDailyAggregates.dimensionKey],set:{metricValue,computedAt}});
 await tx.insert(schema.analyticsDailyAggregates).values({metricDate:date,metricName:'report_complete',dimensionKey:'all',metricValue:1,computedAt}).onConflictDoUpdate({target:[schema.analyticsDailyAggregates.metricDate,schema.analyticsDailyAggregates.metricName,schema.analyticsDailyAggregates.dimensionKey],set:{metricValue:1,computedAt}});
 await tx.insert(schema.analyticsReportRuns).values({fromDate:date,toDate:date,status:'completed',sourceWatermark:computedAt,completedAt:computedAt});
 });
}
/** Snapshot current observed source state only. Never invoke this to backfill a
 * prior date: last_ok/error rows cannot reconstruct historical feed health.
 */
export async function materializeSourceSnapshot(db:PgDatabase<PgQueryResultHKT,typeof schema>,observedAt=new Date()):Promise<void>{
 if(!Number.isFinite(observedAt.getTime()))throw new Error('Invalid observation timestamp');
 const date=observedAt.toISOString().slice(0,10);
 await db.transaction(async tx=>{
  const rows=await tx.select({source:schema.releaseSources}).from(schema.releaseSources).innerJoin(schema.applications,eq(schema.applications.id,schema.releaseSources.applicationId)).where(eq(schema.applications.isActive,true));
  const enabled=rows.map(r=>r.source).filter(r=>r.enabled),fresh=enabled.filter(r=>r.lastOkAt&&r.lastOkAt<=observedAt&&r.lastOkAt.getTime()>=observedAt.getTime()-4*3600000).length,unpolled=enabled.filter(r=>!r.lastOkAt).length;
  const values:Record<string,number>={source_enabled:enabled.length,source_disabled:rows.length-enabled.length,source_fresh:fresh,source_unpolled:unpolled,source_stale:enabled.length-fresh-unpolled,source_failing:enabled.filter(r=>r.failureCount>0).length,source_history_limited:enabled.filter(r=>r.historyLimited).length,source_snapshot_complete:1};
  for(const [metricName,metricValue] of Object.entries(values))await tx.insert(schema.analyticsDailyAggregates).values({metricDate:date,metricName,dimensionKey:'all',metricValue,computedAt:observedAt}).onConflictDoUpdate({target:[schema.analyticsDailyAggregates.metricDate,schema.analyticsDailyAggregates.metricName,schema.analyticsDailyAggregates.dimensionKey],set:{metricValue,computedAt:observedAt}});
 });
}

