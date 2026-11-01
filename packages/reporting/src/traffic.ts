import {sql} from 'drizzle-orm';import type {PgDatabase,PgQueryResultHKT} from 'drizzle-orm/pg-core';
import {analyticsDailyAggregates} from '@labticker/database/schema';
const channels=['direct','internal','search','community','social','email','campaign','other'] as const;
export const trafficMetrics=['traffic_pageviews','traffic_visitors_estimated','traffic_source_direct','traffic_source_internal','traffic_source_search','traffic_source_community','traffic_source_social','traffic_source_email','traffic_source_campaign','traffic_source_other'] as const;
const validDate=(date:string)=>/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date))&&new Date(date).toISOString().slice(0,10)===date;
export interface TrafficDay{date:string;counts:Readonly<Record<string,number>>;}
/** Fixed aggregate-only query. No identity, raw URL, event payload or caller SQL
 * can enter the result. API contract: https://posthog.com/docs/sql#query-api */
export async function fetchTrafficAggregates(env:Record<string,string|undefined>,from:string,to:string,request:typeof fetch=fetch):Promise<TrafficDay[]>{
 if(!validDate(from)||!validDate(to)||to<from||(Date.parse(to)-Date.parse(from))/86400000>120)throw new Error('Invalid traffic report range');
 const host=env.POSTHOG_API_HOST,id=env.POSTHOG_PROJECT_ID,key=env.POSTHOG_QUERY_API_KEY;
 if(!['https://us.posthog.com','https://eu.posthog.com'].includes(host??'')||!/^\d{1,12}$/.test(id??'')||!key)throw new Error('Read-only traffic project configuration required');
 const end=new Date(Date.parse(to)+86400000).toISOString().slice(0,10);
 const query=`SELECT toString(toDate(timestamp, 'UTC')), count(), uniqExact(distinct_id), ${channels.map(channel=>`countIf(properties.acquisition = '${channel}')`).join(', ')} FROM events WHERE event = '$pageview' AND properties.route IN ('/', '/apps', '/apps/[slug]') AND timestamp >= toDateTime('${from} 00:00:00', 'UTC') AND timestamp < toDateTime('${end} 00:00:00', 'UTC') GROUP BY toDate(timestamp, 'UTC') ORDER BY toDate(timestamp, 'UTC') LIMIT 121`;
 try{
  const response=await request(`${host}/api/projects/${id}/query`,{method:'POST',redirect:'error',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({query:{kind:'HogQLQuery',query},name:'LabTicker aggregate acquisition'}),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error();
  const reader=response.body?.getReader();if(!reader)throw new Error();const chunks:Uint8Array[]=[];let size=0;
  while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.length;if(size>131072){await reader.cancel();throw new Error();}chunks.push(chunk.value);}
  const data=JSON.parse(Buffer.concat(chunks).toString('utf8')) as {results?:unknown;hasMore?:boolean;error?:unknown};
  if(!Array.isArray(data.results)||data.results.length>121||data.hasMore||data.error)throw new Error();
  const found=new Map<string,TrafficDay>();
  for(const row of data.results){
   if(!Array.isArray(row)||row.length!==trafficMetrics.length+1||typeof row[0]!=='string'||!validDate(row[0])||row[0]<from||row[0]>to||found.has(row[0])||row.slice(1).some(value=>!Number.isSafeInteger(value)||value<0)||row[2]>row[1])throw new Error();
   found.set(row[0],{date:row[0],counts:Object.fromEntries(trafficMetrics.map((metric,index)=>[metric,row[index+1]]))});
  }
  const days:TrafficDay[]=[];for(let time=Date.parse(from);time<=Date.parse(to);time+=86400000){const date=new Date(time).toISOString().slice(0,10);days.push(found.get(date)??{date,counts:Object.fromEntries(trafficMetrics.map(metric=>[metric,0]))});}return days;
 }catch{throw new Error('Aggregate traffic provider unavailable');}
}
export async function materializeTraffic<TSchema extends Record<string,unknown>>(db:PgDatabase<PgQueryResultHKT,TSchema>,days:readonly TrafficDay[],computedAt=new Date()){
 if(!days.length)return;
 const rows=days.flatMap(day=>{if(!validDate(day.date)||Date.parse(day.date)+86400000>computedAt.getTime())throw new Error('Complete traffic dates required');return [...trafficMetrics.map(metric=>({metricDate:day.date,metricName:metric,dimensionKey:'all',metricValue:day.counts[metric]??0,computedAt})),{metricDate:day.date,metricName:'traffic_report_complete',dimensionKey:'all',metricValue:1,computedAt}];});
 await db.insert(analyticsDailyAggregates).values(rows).onConflictDoUpdate({target:[analyticsDailyAggregates.metricDate,analyticsDailyAggregates.metricName,analyticsDailyAggregates.dimensionKey],set:{metricValue:sql`excluded.metric_value`,computedAt:sql`excluded.computed_at`}});
}
