import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {drizzle} from 'drizzle-orm/pglite';
import {migrate} from 'drizzle-orm/pglite/migrator';
import {eq} from 'drizzle-orm';
import * as s from '../src/schema.js';
import {listSourceStatus,setSourceEnabled} from '../src/source-admin.js';

test('source administration rechecks database roles, constrains registry mappings and preserves history',async()=>{
 const client=new PGlite();const db=drizzle(client,{schema:s});
 try{
  await migrate(db,{migrationsFolder:'../../drizzle'});
  const now=new Date('2026-01-01T09:00:00Z');
  const [admin]=await db.insert(s.users).values({email:'source-admin@example.invalid',emailVerified:now,role:'admin'}).returning();assert.ok(admin);
  const [regular]=await db.insert(s.users).values({email:'source-user@example.invalid',emailVerified:now}).returning();assert.ok(regular);
  const [app]=await db.insert(s.applications).values({slug:'fixture',name:'Fixture source',description:'Original fixture description',category:'monitoring',homepageUrl:'https://example.com'}).returning();assert.ok(app);
  await db.insert(s.appSourceRecords).values({applicationId:app.id,provider:'custom_json',externalId:'fixture',sourceHash:'fixture-hash',gitCommit:'abcdef1234',provenanceUrl:'catalog/services/fixture.json',lastSeenAt:now});
  const [source]=await db.insert(s.releaseSources).values({applicationId:app.id,provider:'github-releases',externalKey:'example/fixture',url:'https://api.github.com/repos/example/fixture/releases',lastOkAt:now,failureCount:3,nextPollAt:new Date('2026-01-02'),historyLimited:true,lastError:'untrusted upstream@example.invalid text'}).returning();assert.ok(source);
  await db.insert(s.subscriptions).values({userId:regular.id,applicationId:app.id,enabledAt:now});
  await db.insert(s.releases).values({applicationId:app.id,releaseSourceId:source.id,dedupeKey:'fixture-release',title:'Fixture release',releaseUrl:'https://github.com/example/fixture/releases/tag/v1',notesText:'Fixture notes',firstSeenAt:now});
  const registry=new Map([['fixture',new Set(['example/fixture'])]]);
  await assert.rejects(()=>listSourceStatus(db,regular.id),/Administrator/);
  await assert.rejects(()=>setSourceEnabled(db,regular.id,source.id,false,registry),/Administrator/);
  await assert.rejects(()=>setSourceEnabled(db,admin.id,'invalid-id',false,registry),/identifier/);
  assert.equal((await db.select().from(s.releaseSources))[0]?.enabled,true);
  await setSourceEnabled(db,admin.id,source.id,false,registry,now);
  await setSourceEnabled(db,admin.id,source.id,false,registry,now);
  let [stored]=await db.select().from(s.releaseSources);assert.ok(stored);assert.equal(stored.enabled,false);assert.equal(stored.lastOkAt?.getTime(),now.getTime());assert.equal(stored.failureCount,3);assert.equal(stored.historyLimited,true);
  assert.equal((await db.select().from(s.catalogChanges)).length,1);assert.equal((await db.select().from(s.subscriptions)).length,1);assert.equal((await db.select().from(s.releases)).length,1);
  const status=await listSourceStatus(db,admin.id);assert.equal(status[0]?.hasError,true);assert.ok(!JSON.stringify(status).includes('@example.invalid'));assert.ok(!('lastError' in status[0]!));
  await assert.rejects(()=>setSourceEnabled(db,admin.id,source.id,true,new Map(),now),/current approved/);
  await setSourceEnabled(db,admin.id,source.id,true,registry,new Date('2026-01-01T10:00:00Z'));
  [stored]=await db.select().from(s.releaseSources);assert.equal(stored?.enabled,true);assert.equal(stored?.nextPollAt?.toISOString(),'2026-01-01T10:00:00.000Z');assert.equal(stored?.failureCount,3);
  const [audit]=await db.select().from(s.catalogChanges);assert.ok(audit);assert.equal((audit.current as {kind:string}).kind,'source_control');
  // A role cached by an earlier page is never sufficient for subsequent mutation.
  await db.update(s.users).set({role:'user'}).where(eq(s.users.id,admin.id));
  await assert.rejects(()=>setSourceEnabled(db,admin.id,source.id,false,registry),/Administrator/);
 }finally{await client.close();}
});
test('unsupported, unreviewed and tampered destinations cannot be activated',async()=>{
 const client=new PGlite();const db=drizzle(client,{schema:s});
 try{
  await migrate(db,{migrationsFolder:'../../drizzle'});const now=new Date();
  const [admin]=await db.insert(s.users).values({email:'source-policy-admin@example.invalid',emailVerified:now,role:'admin'}).returning();assert.ok(admin);
  const [app]=await db.insert(s.applications).values({slug:'fixture',name:'Fixture',description:'Fixture description',category:'monitoring',homepageUrl:'https://example.com'}).returning();assert.ok(app);
  const [source]=await db.insert(s.releaseSources).values({applicationId:app.id,provider:'github-releases',externalKey:'example/fixture',url:'https://api.github.com/repos/example/fixture/releases',enabled:false}).returning();assert.ok(source);
  const registry=new Map([['fixture',new Set(['example/fixture'])]]);
  await assert.rejects(()=>setSourceEnabled(db,admin.id,source.id,true,registry),/reviewed/);
  await db.insert(s.appSourceRecords).values({applicationId:app.id,provider:'custom_json',externalId:'fixture',sourceHash:'fixture-hash',gitCommit:'abcdef1234',provenanceUrl:'catalog/services/fixture.json',lastSeenAt:now});
  for(const changes of [{provider:'rss',url:'https://example.com/feed'},{provider:'github-releases',url:'https://127.0.0.1/releases'},{provider:'github-releases',url:'https://api.github.com/repos/example/fixture/releases',externalKey:'example/..'}]){
   await db.update(s.releaseSources).set(changes).where(eq(s.releaseSources.id,source.id));
   await assert.rejects(()=>setSourceEnabled(db,admin.id,source.id,true,registry),/reviewed/);
  }
  await db.update(s.users).set({deletedAt:now}).where(eq(s.users.id,admin.id));
  await assert.rejects(()=>listSourceStatus(db,admin.id),/Administrator/);
  assert.equal((await db.select().from(s.catalogChanges)).length,0);
 }finally{await client.close();}
});
