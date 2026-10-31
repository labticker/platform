import {test} from 'node:test';import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';import {drizzle} from 'drizzle-orm/pglite';import {migrate} from 'drizzle-orm/pglite/migrator';
import * as schema from '@labticker/database/schema';import {materializeDaily} from '../src/index.js';import {readSummary,createSummaryHandler,parseSummaryQuery} from '../src/reader.js';import {cohortCounts} from '../src/cohorts.js';
test('authoritative historical cohorts mature and retain as-of state, not current state',async()=>{
 const client=new PGlite(),db=drizzle(client,{schema});try{await migrate(db,{migrationsFolder:'../../drizzle'});
 const verified=new Date('2026-01-01T12:00Z');
 for(let i=0;i<12;i++){const [user]=await db.insert(schema.users).values({email:`fixture${i}@example.com`,emailVerified:verified,createdAt:verified}).returning();assert.ok(user);
 await db.insert(schema.accountStateEvents).values([{userId:user.id,eventType:'verified_signup',occurredAt:verified,activeMonitorCount:0,consented:false,enabled:false,suppressed:false},{userId:user.id,eventType:'monitor_added',occurredAt:new Date('2026-01-02'),activeMonitorCount:3,consented:true,enabled:true,suppressed:false},{userId:user.id,eventType:'suppressed',occurredAt:new Date('2026-02-10'),activeMonitorCount:3,consented:false,enabled:false,suppressed:true}]);}
 const [old]=await db.insert(schema.users).values({email:'old@example.com',emailVerified:verified}).returning();assert.ok(old);
 const accounts=await db.select().from(schema.users),history=await db.select().from(schema.accountStateEvents);
 assert.deepEqual(cohortCounts(accounts,history,new Date('2026-01-01'),new Date('2026-01-02'),new Date('2026-01-05')),{activationEligible:0,activated:0,retentionEligible:0,retained:0,unmeasured:1});
 await materializeDaily(db,'2026-01-01',new Date('2026-03-01'));await materializeDaily(db,'2026-01-01',new Date('2026-03-01'));
 const report=await readSummary(db,{from:'2026-01-01',to:'2026-01-01',offset:0,limit:100});
 assert.equal(report.rows.find(r=>r.metric==='verified_signups')?.value,13);assert.equal(report.rows.find(r=>r.metric==='retained_day30')?.value,12);assert.equal(report.rows.find(r=>r.metric==='activated_three_monitors')?.value,12);assert.equal(report.rows.some(r=>r.metric==='cohort_unmeasured'),false);
 assert.equal(JSON.stringify(report).includes('example.com'),false);assert.equal((await db.select().from(schema.analyticsDailyAggregates)).filter(r=>r.metricName==='verified_signups').length,1);
 }finally{await client.close();}
});
test('aggregate HTTP boundary rejects raw queries, missing credentials, and excessive requests without logging secrets',async()=>{
 let reads=0;const audit:unknown[]=[];const secret='fixture'.repeat(8);const handler=createSummaryHandler({secret:()=>secret,now:()=>100000,read:async q=>{reads++;return {from:q.from,rows:[]};},audit:event=>audit.push(event)});
 const request=(suffix='',auth=secret)=>new Request(`https://actual.fly.dev/api/admin/analytics/summary?from=2026-01-01&to=2026-01-31${suffix}`,{headers:{Authorization:`Bearer ${auth}`}});
 assert.equal((await handler(request('','bad'))).status,401);assert.equal(reads,0);
 for(const suffix of ['&sql=select%20users','&email=fixture','&metric=users','&from=2026-01-01','&limit=999'])assert.equal((await handler(request(suffix))).status,400);
 assert.equal((await handler(request())).status,200);
 for(let i=0;i<24;i++)await handler(request());assert.equal((await handler(request())).status,429);
 assert.equal(JSON.stringify(audit).includes(secret),false);assert.equal(JSON.stringify(audit).includes('sql'),false);
 assert.throws(()=>parseSummaryQuery(new URL('https://actual.fly.dev/?from=2026-02-30&to=2026-03-01')));
 assert.throws(()=>parseSummaryQuery(new URL('https://actual.fly.dev/?from=2025-01-01&to=2026-03-01')));
});
test('delivery aggregates use accepted cohort and tracking-gated delivered denominators',async()=>{
 const client=new PGlite(),db=drizzle(client,{schema});try{await migrate(db,{migrationsFolder:'../../drizzle'});const [u]=await db.insert(schema.users).values({email:'delivery@example.com'}).returning();assert.ok(u);
 for(let i=0;i<2;i++){const [d]=await db.insert(schema.digests).values({userId:u.id,scheduledFor:new Date(`2026-01-01T0${i}:00Z`),windowFrom:new Date('2025-12-31'),windowTo:new Date('2026-01-01'),status:'sent',idempotencyKey:`fixture-${i}`,sentAt:new Date('2026-01-01T12:00Z')}).returning();assert.ok(d);await db.insert(schema.digestMessageEngagement).values({digestId:d.id,deliveredAt:new Date('2026-01-02'),firstOpenedAt:new Date('2026-01-03'),firstClickedAt:new Date('2026-01-03'),trackedOpenEnabled:i===1,trackedClickEnabled:i===1});}
 await materializeDaily(db,'2026-01-01',new Date('2026-03-01'));
 const rows=await db.select().from(schema.analyticsDailyAggregates);const count=(name:string)=>rows.find(r=>r.metricName===name)?.metricValue;
 assert.equal(count('digest_accepted'),2);assert.equal(count('digest_delivered'),2);assert.equal(count('digest_reported_open_estimated'),1);assert.equal(count('digest_tracked_open_delivered'),1);assert.equal(count('digest_reported_click'),1);
 assert.equal((await readSummary(db,{from:'2026-01-01',to:'2026-01-01',offset:0,limit:100})).rows.length,0);
 }finally{await client.close();}
});
