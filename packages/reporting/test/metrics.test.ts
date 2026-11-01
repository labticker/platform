import {test} from 'node:test';import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';import {drizzle} from 'drizzle-orm/pglite';import {migrate} from 'drizzle-orm/pglite/migrator';
import * as schema from '@labticker/database/schema';
import {materializeDaily,materializeSourceSnapshot} from '../src/index.js';
import {readSummary,readOwnerSummary,parseSummaryQuery} from '../src/reader.js';
import {summarizePeriod,summarizeOwnerPeriod,rollingComparisons,rollingOwnerComparisons,type StoredAggregate} from '../src/rollups.js';
test('rolling periods sum complete small daily cells before AI threshold; owner zero rates stay separate',()=>{
 const rows:StoredAggregate[]=[];
 for(let day=0;day<60;day++){
  const date=new Date(Date.parse('2026-01-01')+day*86400000).toISOString().slice(0,10),computedAt=new Date('2026-04-01');
  for(const [metricName,metricValue] of Object.entries({report_complete:1,verified_signups:3,digest_accepted:20,digest_delivered:day<30?10:15,digest_bounced:0}))rows.push({metricDate:date,metricName,metricValue,dimensionKey:'all',computedAt});
 }
 const windows=rollingComparisons(rows,'2026-01-01','2026-03-01'),monthly=windows.find(window=>window.days===30);assert.ok(monthly?.available);
 assert.deepEqual(monthly.current.counts.verified_signups,{available:true,value:90});
 assert.equal(monthly.current.rates.find(rate=>rate.name==='bounce')?.available,false);
 assert.deepEqual(monthly.comparisons.find(rate=>rate.name==='delivery'),{name:'delivery',available:true,percentagePointChange:25});
 const owner=summarizeOwnerPeriod(rows,'2026-01-31','2026-03-01');const bounce=owner.rates.find(rate=>rate.name==='bounce');assert.ok(bounce?.available);assert.equal(bounce.value,0);
 assert.equal(summarizePeriod(rows,'2026-01-01','2026-01-01').counts.verified_signups?.available,false);
 const incomplete=rows.filter(row=>!(row.metricDate==='2026-02-01'&&row.metricName==='report_complete'));
 assert.equal(summarizeOwnerPeriod(incomplete,'2026-01-31','2026-03-01').counts.verified_signups?.available,false);
 assert.throws(()=>parseSummaryQuery(new URL('https://report.invalid/?from=2026-01-01&to=2026-01-02&audience=owner')));
});
test('withdrawal taxonomy separates explicit consent actions from bounce/complaint and unknown history',async()=>{
 const client=new PGlite(),db=drizzle(client,{schema});try{await migrate(db,{migrationsFolder:'../../drizzle'});
 for(let index=0;index<14;index++){
  const [user]=await db.insert(schema.users).values({email:`withdrawal${index}@example.com`,emailVerified:new Date('2026-01-01')}).returning();assert.ok(user);
  await db.insert(schema.accountStateEvents).values({userId:user.id,eventType:'verified_signup',occurredAt:new Date('2026-01-01'),activeMonitorCount:1,consented:true,enabled:true,suppressed:false});
  if(index<12)for(const eventType of ['preferences_updated','digest_consent_withdrawn','unsubscribe_completed'])await db.insert(schema.accountStateEvents).values({userId:user.id,eventType,occurredAt:new Date('2026-01-02T12:00Z'),activeMonitorCount:1,consented:false,enabled:false,suppressed:true});
  else await db.insert(schema.accountStateEvents).values({userId:user.id,eventType:index===12?'email_bounced':'suppressed',occurredAt:new Date('2026-01-02T12:00Z'),activeMonitorCount:1,consented:false,enabled:false,suppressed:true});
 }
 await materializeDaily(db,'2026-01-02',new Date('2026-02-03'));
 const owner=await readOwnerSummary(db,'2026-01-02','2026-01-02');
 assert.deepEqual(owner.period.counts.unsubscribe_accounts,{available:true,value:12});assert.deepEqual(owner.period.counts.unsubscribe_at_risk,{available:true,value:14});assert.deepEqual(owner.period.counts.suppression_unclassified_accounts,{available:true,value:1});
 const rate=owner.period.rates.find(value=>value.name==='unsubscribe');assert.ok(rate?.available);assert.equal(rate.value,12/14);
 const ai=await readSummary(db,{from:'2026-01-02',to:'2026-01-02',offset:0,limit:100});assert.equal(ai.rows.some(row=>row.metric==='suppression_unclassified_accounts'),false);assert.equal(JSON.stringify(ai).includes('example.com'),false);
 }finally{await client.close();}
});
test('source freshness is an observed snapshot and never backfilled into past daily reports',async()=>{
 const client=new PGlite(),db=drizzle(client,{schema});try{await migrate(db,{migrationsFolder:'../../drizzle'});
 const [app]=await db.insert(schema.applications).values({slug:'source-fixture',name:'Source fixture',description:'Fixture project',category:'monitoring',homepageUrl:'https://example.com'}).returning();assert.ok(app);
 for(let index=0;index<13;index++)await db.insert(schema.releaseSources).values({applicationId:app.id,provider:'github-releases',externalKey:`fixture/${index}`,url:`https://api.github.com/repos/fixture/${index}/releases`,enabled:index!==12,lastOkAt:index<10?new Date('2026-01-02T11:00Z'):index===10?new Date('2026-01-01'):null,lastError:index===0||index===10?'Fixture source error':index===1?'History coverage limited':null,failureCount:index===0||index===10?1:0,historyLimited:index===1});
 await materializeSourceSnapshot(db,new Date('2026-01-02T12:00Z'));await materializeSourceSnapshot(db,new Date('2026-01-02T12:05Z'));await materializeDaily(db,'2026-01-01',new Date('2026-01-03'));
 const owner=await readOwnerSummary(db,'2026-01-02','2026-01-02');assert.deepEqual(owner.period.counts.source_enabled,{available:true,value:12});assert.deepEqual(owner.period.counts.source_fresh,{available:true,value:10});assert.deepEqual(owner.period.counts.source_failing,{available:true,value:2});
 const rows=await db.select().from(schema.analyticsDailyAggregates);assert.equal(rows.filter(row=>row.metricName==='source_enabled').length,1);assert.equal(rows.some(row=>row.metricName.startsWith('source_')&&row.metricDate==='2026-01-01'),false);
 const ai=await readSummary(db,{from:'2026-01-02',to:'2026-01-02',offset:0,limit:100});const freshness=ai.period.rates.find(rate=>rate.name==='source_freshness');assert.ok(freshness?.available);assert.equal(freshness.value,10/12);
 }finally{await client.close();}
});
test('digest coverage keeps scheduled cohorts separate from later acceptance dates and empty windows',async()=>{
 const client=new PGlite(),db=drizzle(client,{schema});try{await migrate(db,{migrationsFolder:'../../drizzle'});
 const [user]=await db.insert(schema.users).values({email:'coverage@example.com'}).returning();assert.ok(user);
 const [app]=await db.insert(schema.applications).values({slug:'coverage-fixture',name:'Coverage fixture',description:'Fixture project',category:'monitoring',homepageUrl:'https://example.com'}).returning();assert.ok(app);
 const [source]=await db.insert(schema.releaseSources).values({applicationId:app.id,provider:'github-releases',externalKey:'fixture/coverage',url:'https://api.github.com/repos/fixture/coverage/releases'}).returning();assert.ok(source);
 const [release]=await db.insert(schema.releases).values({applicationId:app.id,releaseSourceId:source.id,dedupeKey:'fixture-release',title:'Fixture release',releaseUrl:'https://github.com/fixture/coverage/releases/tag/v1',notesText:'Fixture notes',firstSeenAt:new Date('2026-01-01')}).returning();assert.ok(release);
 for(let index=0;index<3;index++){
  const [digest]=await db.insert(schema.digests).values({userId:user.id,scheduledFor:new Date(`2026-01-01T0${index}:00Z`),windowFrom:new Date('2025-12-31'),windowTo:new Date('2026-01-01'),deliveryMode:'resend',status:index===0?'sent':index===1?'pending':'skipped',idempotencyKey:`coverage-${index}`,sentAt:index===0?new Date('2026-01-02'):null}).returning();assert.ok(digest);
  if(index<2)await db.insert(schema.digestItems).values({digestId:digest.id,releaseId:release.id,snapshot:{fixture:true}});
 }
 await materializeDaily(db,'2026-01-01',new Date('2026-01-03'));await materializeDaily(db,'2026-01-02',new Date('2026-01-03'));
 const first=await readOwnerSummary(db,'2026-01-01','2026-01-01'),second=await readOwnerSummary(db,'2026-01-02','2026-01-02');
 assert.deepEqual(first.period.counts.digest_due,{available:true,value:2});assert.deepEqual(first.period.counts.digest_due_accepted,{available:true,value:1});assert.deepEqual(first.period.counts.digest_accepted,{available:true,value:0});assert.deepEqual(second.period.counts.digest_accepted,{available:true,value:1});
 assert.equal(first.period.rates.find(rate=>rate.name==='digest_coverage')?.available,false); // denominator below ten stays unavailable
 }finally{await client.close();}
});
test('rolling activation and retention compare fully matured shifted signup cohorts with exact labels',()=>{
 const rows:StoredAggregate[]=[];
 for(let day=0;day<90;day++){
  const date=new Date(Date.parse('2026-01-01')+day*86400000).toISOString().slice(0,10),computedAt=new Date('2026-04-01T12:00Z');
  const values={report_complete:1,verified_signups:3,activation_eligible:date<='2026-03-24'?20:0,activated_three_monitors:date<='2026-02-22'?10:date<='2026-03-24'?15:0,retention_eligible:date<='2026-03-01'?20:0,retained_day30:date<='2026-01-30'?10:date<='2026-03-01'?12:0};
  for(const [metricName,metricValue] of Object.entries(values))rows.push({metricDate:date,metricName,metricValue,dimensionKey:'all',computedAt});
 }
 const report=rollingOwnerComparisons(rows,'2026-01-01','2026-03-31').find(window=>window.days===30);assert.ok(report?.available);
 const activation=report.current.rates.find(rate=>rate.name==='activation');assert.ok(activation?.available);assert.equal(activation.value,.75);assert.equal(activation.cohortFrom,'2026-02-23');assert.equal(activation.cohortTo,'2026-03-24');assert.equal(activation.windowBasis,'maturity_date');assert.equal(activation.denominatorCount,600);assert.equal(activation.numeratorCount,450);assert.deepEqual(activation.asOf,{from:'2026-04-01T12:00:00.000Z',to:'2026-04-01T12:00:00.000Z'});
 const retention=report.current.rates.find(rate=>rate.name==='retention_day30');assert.ok(retention?.available);assert.equal(retention.value,.6);assert.equal(retention.cohortFrom,'2026-01-31');assert.equal(retention.cohortTo,'2026-03-01');assert.equal(retention.denominatorCount,600);assert.equal(retention.numeratorCount,360);
 const prior=report.previous.rates.find(rate=>rate.name==='retention_day30');assert.ok(prior?.available);assert.equal(prior.cohortFrom,'2026-01-01');assert.equal(prior.cohortTo,'2026-01-30');assert.equal(prior.value,.5);
 const change=report.comparisons.find(rate=>rate.name==='retention_day30');assert.ok(change?.available);assert.ok(Math.abs(change.percentagePointChange-10)<1e-10);
 assert.deepEqual(report.current.counts.verified_signups,{available:true,value:90}); // flow counts still use calendar dates
 const short=rollingOwnerComparisons(rows,'2026-01-31','2026-03-31').find(window=>window.days===30);assert.ok(short?.available);assert.equal(short.previous.rates.find(rate=>rate.name==='retention_day30')?.available,false);assert.equal(short.comparisons.find(rate=>rate.name==='retention_day30')?.available,false);
 const stale=rows.map(row=>row.metricDate==='2026-01-31'?{...row,computedAt:new Date('2026-02-01')}:row);
 const incomplete=rollingOwnerComparisons(stale,'2026-01-01','2026-03-31').find(window=>window.days===30);assert.ok(incomplete?.available);assert.equal(incomplete.current.rates.find(rate=>rate.name==='retention_day30')?.available,false);
});
