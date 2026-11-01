import {test} from 'node:test';import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';import {drizzle} from 'drizzle-orm/pglite';import {migrate} from 'drizzle-orm/pglite/migrator';
import * as s from '@labticker/database/schema';
import {fetchTrafficAggregates,materializeTraffic} from '../src/traffic.js';import {readOwnerSummary,readSummary} from '../src/reader.js';
const env={POSTHOG_API_HOST:'https://us.posthog.com',POSTHOG_PROJECT_ID:'42',POSTHOG_QUERY_API_KEY:'fixture-read-only-key'};
test('traffic requests fixed aggregates only and rejects raw/error/partial shapes without leaking credentials',async()=>{
 let body='';const request:typeof fetch=async(input,options)=>{assert.equal(input,'https://us.posthog.com/api/projects/42/query');assert.equal(options?.redirect,'error');body=String(options?.body);return Response.json({results:[['2026-01-01',20,10,10,0,0,10,0,0,0,0]]});};
 const days=await fetchTrafficAggregates(env,'2026-01-01','2026-01-02',request);assert.equal(days.length,2);assert.equal(days[0]?.counts.traffic_visitors_estimated,10);assert.equal(days[1]?.counts.traffic_pageviews,0);
 assert.ok(body.includes('uniqExact(distinct_id)'));assert.ok(!/SELECT \*|email|fixture-read-only-key|current_url/.test(body.replaceAll("'email'",'')));
 for(const payload of [{results:[['private@example.invalid',20,10]]},{results:[['2026-01-01',-1,2,0,0,0,0,0,0,0,0]]},{error:'private response'},{results:[],hasMore:true}])await assert.rejects(fetchTrafficAggregates(env,'2026-01-01','2026-01-02',async()=>Response.json(payload)),/^Error: Aggregate traffic provider unavailable$/);
 await assert.rejects(fetchTrafficAggregates({...env,POSTHOG_API_HOST:'https://evil.invalid'},'2026-01-01','2026-01-02',request),/configuration/);
 await assert.rejects(fetchTrafficAggregates(env,"2026-01-01'; SELECT *",'2026-01-02',request),/range/);
});
test('traffic has its own completeness watermark; unobserved traffic is unavailable and never inferred as zero',async()=>{
 const client=new PGlite(),db=drizzle(client,{schema:s});try{await migrate(db,{migrationsFolder:'../../drizzle'});
  const before=await readOwnerSummary(db,'2026-01-01','2026-01-01');assert.equal(before.period.counts.traffic_pageviews?.available,false);
  const days=await fetchTrafficAggregates(env,'2026-01-01','2026-01-02',async()=>Response.json({results:[['2026-01-01',20,10,10,0,0,10,0,0,0,0]]}));
  await materializeTraffic(db,days,new Date('2026-01-03'));await materializeTraffic(db,days,new Date('2026-01-04'));
  const owner=await readOwnerSummary(db,'2026-01-01','2026-01-02');assert.deepEqual(owner.period.counts.traffic_pageviews,{available:true,value:20});assert.deepEqual(owner.period.counts.traffic_source_search,{available:true,value:0});
  const ai=await readSummary(db,{from:'2026-01-01',to:'2026-01-02',offset:0,limit:100});assert.equal(ai.rows.some(row=>row.metric==='traffic_source_search'),false);assert.ok(!JSON.stringify(ai).includes('fixture-read-only-key'));
 }finally{await client.close();}
});
