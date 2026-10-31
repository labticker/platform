import {and,eq,gte,lte,inArray} from 'drizzle-orm';
import type {PgDatabase,PgQueryResultHKT} from 'drizzle-orm/pg-core';
import {analyticsDailyAggregates} from '@labticker/database/schema';
import {timingSafeEqual} from 'node:crypto';
import {metrics,type Metric} from './metrics.js';
import {completeMarkers,summarizePeriod,summarizeOwnerPeriod,rollingComparisons,rollingOwnerComparisons} from './rollups.js';
export {metrics};export type {Metric};
export interface SummaryQuery{from:string;to:string;metric?:Metric;offset:number;limit:number;}
const validDate=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
export function parseSummaryQuery(url:URL):SummaryQuery{
 const allowed=new Set(['from','to','metric','offset','limit']);
 for(const key of url.searchParams.keys())if(!allowed.has(key)||url.searchParams.getAll(key).length!==1)throw new Error('Unsupported query');
 const from=url.searchParams.get('from')??'',to=url.searchParams.get('to')??'';
 if(!validDate(from)||!validDate(to)||to<from||(Date.parse(to)-Date.parse(from))/86400000>92)throw new Error('Invalid date range');
 const metric=url.searchParams.get('metric');if(metric&&!metrics.includes(metric as Metric))throw new Error('Unknown metric');
 const offset=Number(url.searchParams.get('offset')??0),limit=Number(url.searchParams.get('limit')??100);
 if(!Number.isSafeInteger(offset)||offset<0||offset>10000||!Number.isSafeInteger(limit)||limit<1||limit>500)throw new Error('Invalid pagination');
 return {from,to,...(metric?{metric:metric as Metric}:{}),offset,limit};
}
export interface AggregateRow{date:string;metric:Metric;dimension:'all';value:number;}
/** The reporting reader only selects the aggregate table. It has no raw-account query path. */
export async function readSummary<TSchema extends Record<string,unknown>>(db:PgDatabase<PgQueryResultHKT,TSchema>,q:SummaryQuery){
 const rows=await db.select().from(analyticsDailyAggregates).where(and(gte(analyticsDailyAggregates.metricDate,q.from),lte(analyticsDailyAggregates.metricDate,q.to),eq(analyticsDailyAggregates.dimensionKey,'all'),...(q.metric?[eq(analyticsDailyAggregates.metricName,q.metric)]:[]))).orderBy(analyticsDailyAggregates.metricDate,analyticsDailyAggregates.metricName).limit(q.limit).offset(q.offset);
 const data:AggregateRow[]=rows.filter(r=>metrics.includes(r.metricName as Metric)&&r.dimensionKey==='all'&&Number.isSafeInteger(r.metricValue)&&r.metricValue>=10).map(r=>({date:r.metricDate,metric:r.metricName as Metric,dimension:'all',value:r.metricValue}));
 const all=await aggregateWindow(db,q.from,q.to,q.metric);
 return {from:q.from,to:q.to,rows:data,nextOffset:rows.length===q.limit?q.offset+q.limit:null,period:summarizePeriod(all,q.from,q.to),rolling:rollingComparisons(all,q.from,q.to),privacy:{minimumCellCount:10,suppressedCellsOmitted:true},unavailable:['acquisition_requires_PostHog','engaged_retention_requires_disclosed_history'],notes:['Reported opens are unreliable estimates due to Apple MPP and proxies.','Clicks can include link scanners.','Delivery/open/click metrics use accepted-message cohort date; coverage uses scheduled-date cohort.','Periods require every complete-date watermark. Counts are summed before thresholding; missing dates are not zero.','No rate is inferred from omitted or unmatched denominators.','Source health is a latest observed gauge, not a historical backfill or sum.','Unsubscribe rate over multiple dates is an account-day rate, not unique lifetime accounts.']};
}
async function aggregateWindow<TSchema extends Record<string,unknown>>(db:PgDatabase<PgQueryResultHKT,TSchema>,from:string,to:string,metric?:Metric){
 return db.select().from(analyticsDailyAggregates).where(and(gte(analyticsDailyAggregates.metricDate,from),lte(analyticsDailyAggregates.metricDate,to),eq(analyticsDailyAggregates.dimensionKey,'all'),inArray(analyticsDailyAggregates.metricName,[...(metric?[metric]:metrics),...completeMarkers])));
}
/** Internal owner-only presentation helper. HTTP callers cannot select this path or
 * request unsuppressed cells. It still reads only precomputed aggregate records.
 */
export async function readOwnerSummary<TSchema extends Record<string,unknown>>(db:PgDatabase<PgQueryResultHKT,TSchema>,from:string,to:string){
 const checked=parseSummaryQuery(new URL(`https://report.invalid/?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`));
 const all=await aggregateWindow(db,checked.from,checked.to);
 return {from,to,period:summarizeOwnerPeriod(all,from,to),rolling:rollingOwnerComparisons(all,from,to),notes:['Owner counts may include small aggregate cells. The AI/service API always suppresses them.','Rates require complete paired dates and denominators of at least ten.','Open rates are unreliable estimates; scanners may inflate clicks.']};
}
export function authorizedBearer(header:string|null,secret:string|undefined):boolean{
 if(!secret||secret.length<32||!header?.startsWith('Bearer ')||header.length>1024)return false;
 const actual=Buffer.from(header.slice(7)),expected=Buffer.from(secret);return actual.length===expected.length&&timingSafeEqual(actual,expected);
}
export function createSummaryHandler(deps:{read:(q:SummaryQuery)=>Promise<unknown>;secret:()=>string|undefined;now?:()=>number;audit?:(event:{action:'aggregate_summary';outcome:'denied'|'invalid'|'limited'|'ok'|'error'})=>void}){
 let windowStart=0,count=0;const now=deps.now??Date.now;
 return async(request:Request):Promise<Response>=>{
 const finish=(outcome:'denied'|'invalid'|'limited'|'ok'|'error',body:unknown,status:number)=>{deps.audit?.({action:'aggregate_summary',outcome});return Response.json(body,{status,headers:{'Cache-Control':'no-store'}});};
 if(!authorizedBearer(request.headers.get('authorization'),deps.secret()))return finish('denied',{error:'Unauthorized'},401);
 const stamp=now();if(stamp-windowStart>=60000){windowStart=stamp;count=0;}if(++count>30)return finish('limited',{error:'Rate limit exceeded'},429);
 let query:SummaryQuery;try{query=parseSummaryQuery(new URL(request.url));}catch{return finish('invalid',{error:'Invalid query'},400);}
 try{return finish('ok',await deps.read(query),200);}catch{return finish('error',{error:'Report unavailable'},503);}
 };}


