import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {drizzle} from 'drizzle-orm/pglite';
import {migrate} from 'drizzle-orm/pglite/migrator';
import * as schema from '../src/schema.js';
import {sourceState,readPublicCatalog,readPublicApplication} from '../src/public-catalog.js';
test('source status separates absence, paused, unpolled, stale and actual failures',()=>{
 const now=new Date('2026-01-01T12:00:00Z'),source={enabled:true,failureCount:0,lastOkAt:now,historyLimited:true};
 assert.equal(sourceState([],now),'unsupported');assert.equal(sourceState([{...source,enabled:false}],now),'paused');
 assert.equal(sourceState([{...source,lastOkAt:null}],now),'pending');assert.equal(sourceState([{...source,lastOkAt:new Date('2026-01-01T07:00:00Z')}],now),'stale');
 assert.equal(sourceState([source],now),'tracking');assert.equal(sourceState([{...source,failureCount:1}],now),'degraded');
});
test('public catalog hides private applications/errors and retains bounded source history and aliases',async()=>{
 const client=new PGlite(),db=drizzle(client,{schema});try{
  await migrate(db,{migrationsFolder:'../../drizzle'});
  const now=new Date('2026-01-01T12:00:00Z');
  const [app]=await db.insert(schema.applications).values({slug:'new-fixture',name:'Fixture',description:'Original fixture summary',category:'monitoring',homepageUrl:'https://example.com'}).returning();assert.ok(app);
  await db.insert(schema.applications).values({slug:'hidden-fixture',name:'Hidden fixture',description:'Private fixture summary',category:'monitoring',homepageUrl:'https://example.com',hidden:true});
  await db.insert(schema.appAliases).values({applicationId:app.id,alias:'old-fixture'});
  const [source]=await db.insert(schema.releaseSources).values({applicationId:app.id,provider:'github-releases',url:'https://api.github.com/repos/example/fixture/releases',externalKey:'example/fixture',lastOkAt:now,lastPolledAt:now,historyLimited:true,lastError:'private-provider-token'}).returning();assert.ok(source);
  await db.insert(schema.releases).values({applicationId:app.id,releaseSourceId:source.id,title:'Fixture release',dedupeKey:'fixture-release',tag:'v1.0.0',releaseUrl:'https://github.com/example/fixture/releases/tag/v1.0.0',notesText:'n'.repeat(5000),firstSeenAt:now,publishedAt:now,isBackfill:true,warningFlags:[{label:'Possible breaking change',evidence:'BREAKING CHANGE'}]});
  await db.insert(schema.appSourceRecords).values({applicationId:app.id,provider:'custom_json',externalId:'new-fixture',sourceHash:'a'.repeat(64),gitCommit:'b'.repeat(40),provenanceUrl:'catalog/services/new-fixture.json',lastSeenAt:now});
  const catalog=await readPublicCatalog(db,now);assert.equal(catalog.length,1);assert.equal(catalog[0]?.sourceState,'tracking');assert.equal(catalog[0]?.canMonitor,true);assert.deepEqual(catalog[0]?.aliases,['old-fixture']);
  assert.ok(!JSON.stringify(catalog).includes('private-provider-token'));assert.ok(!JSON.stringify(catalog).includes('notesText'));
  assert.equal(await readPublicApplication(db,'hidden-fixture',now),null);assert.equal(await readPublicApplication(db,'../users',now),null);
  const detail=await readPublicApplication(db,'old-fixture',now);assert.equal(detail?.app.id,app.id);assert.equal(detail?.app.slug,'new-fixture');assert.equal(detail?.releases[0]?.notes.length,1200);assert.equal(detail?.releases[0]?.backfill,true);assert.equal(detail?.provenance[0]?.revision,'b'.repeat(40));
  assert.ok(!JSON.stringify(detail).includes('private-provider-token'));
 }finally{await client.close();}
});
