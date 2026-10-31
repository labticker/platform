import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { eq } from 'drizzle-orm';
import * as schema from '@labticker/database/schema';
import { upsertCatalogEntry } from '@labticker/database';
import { GitHubReleasesAdapter,prepareReleaseBatch,classifyRelease } from '@labticker/releases';
import { eligibleReleases,composeDigest,MockEmailGateway,signUnsubscribe,verifyUnsubscribe,type DigestRelease,type EmailMessage } from '@labticker/notifications';

/** Acceptance fixture, not a scheduler: no network/provider or production credentials. */
test('offline release → PostgreSQL → consented digest → mock acceptance → receipt survives rescan/retry',async()=>{
 const client=new PGlite(); const db=drizzle(client,{schema});
 try {
  await migrate(db,{migrationsFolder:'../../drizzle'});
  const subscribedAt=new Date('2026-03-08T12:00:00Z');
  const observedAt=new Date('2026-03-09T12:00:00Z');
  const windowEnd=new Date('2026-03-10T09:00:00Z');
  const appId=await upsertCatalogEntry(db,{externalId:'fixture-stable',provider:'custom_json',sourceHash:'fixture-hash',gitCommit:'fixture-commit',provenanceUrl:'catalog/services/fixture.json',slug:'fixture',name:'Fixture Project',description:'Original integration fixture',category:'monitoring',homepageUrl:'https://example.com',repoUrl:'https://github.com/example/project'});
  const [source]=await db.insert(schema.releaseSources).values({applicationId:appId,provider:'github-releases',url:'https://api.github.com/repos/example/project/releases',externalKey:'example/project'}).returning(); assert.ok(source);
  const [user]=await db.insert(schema.users).values({email:'offline-fixture@example.invalid',emailVerified:subscribedAt}).returning(); assert.ok(user);
  await db.insert(schema.emailConsents).values({userId:user.id,consentType:'digest',policyVersion:'fixture-v1',consentedAt:subscribedAt,source:'offline-test'});
  await db.insert(schema.preferences).values({userId:user.id,frequency:'daily',timezone:'UTC',enabled:true,nextDueAt:windowEnd});
  await db.insert(schema.subscriptions).values({userId:user.id,applicationId:appId,enabledAt:subscribedAt});
  const releaseFixture={id:100,name:'Fixture v2',tag_name:'v2.0.0',draft:false,prerelease:false,html_url:'https://github.com/example/project/releases/tag/v2.0.0',published_at:'2026-03-09T10:00:00Z',body:'BREAKING CHANGE: manual migration required. <script>untrusted()</script>'};
  const adapter=new GitHubReleasesAdapter({get:async()=>({status:200,headers:{etag:'fixture-etag'},body:JSON.stringify([releaseFixture])})},()=>observedAt);
  const polled=await adapter.fetchReleases({kind:'github-releases',repository:'example/project',channel:'stable'}); assert.equal(polled.status,'modified');if(polled.status!=='modified')throw new Error('Expected fixture modified');
  const insertBatch=async(initial:boolean)=>{
   for(const release of prepareReleaseBatch(appId,polled.releases,initial)) {
    const flags=classifyRelease({notesText:release.notesText,releaseUrl:release.releaseUrl,previousTag:'v1.0.0',currentTag:release.versionTag,versionScheme:'semver'});
    await db.insert(schema.releases).values({applicationId:appId,releaseSourceId:source.id,sourceGuid:release.guid,dedupeKey:release.dedupeKey,tag:release.versionTag,title:release.title,releaseUrl:release.releaseUrl,notesText:release.notesText,publishedAt:release.publishedAt,firstSeenAt:release.observedAt,isBackfill:release.isBackfill,warningFlags:flags}).onConflictDoNothing();
   }
  };
  await insertBatch(false);await insertBatch(false);
  assert.equal((await db.select().from(schema.releases)).length,1);
  // Database state supplies selection, rather than fixture assumptions about consent or monitors.
  const audience=async()=>{
   const [current]=await db.select().from(schema.users).where(eq(schema.users.id,user.id));assert.ok(current);
   const [preference]=await db.select().from(schema.preferences).where(eq(schema.preferences.userId,user.id));assert.ok(preference);
   const consents=await db.select().from(schema.emailConsents).where(eq(schema.emailConsents.userId,user.id));
   const subscriptions=await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.userId,user.id));
   return {verified:current.emailVerified!==null,consented:consents.some(c=>c.consentType==='digest'&&!c.withdrawnAt),enabled:preference.enabled,suppressed:current.suppressedAt!==null||current.deletedAt!==null,subscriptions:subscriptions.map(s=>({appId:s.applicationId,enabledAt:s.enabledAt,active:s.active}))};
  };
  const rows=await db.select().from(schema.releases);
  const candidates:DigestRelease[]=rows.map(r=>({id:r.id,appId:r.applicationId,appName:'Fixture Project',title:r.title,version:r.tag??'',releaseUrl:r.releaseUrl,notes:r.notesText,firstSeenAt:r.firstSeenAt,publishedAt:r.publishedAt,isBackfill:r.isBackfill,warnings:(r.warningFlags as {label:string}[]).map(w=>w.label)}));
  const selected=eligibleReleases(await audience(),candidates,new Set(),windowEnd);assert.equal(selected.length,1);assert.ok(selected[0]?.warnings.includes('Possible breaking change'));
  const token=signUnsubscribe(user.id,new Date('2027-01-01'),'fixture-signing-key-'.repeat(3));
  const message=composeDigest({to:user.email,releases:selected,origin:'https://assigned-fixture.fly.dev',unsubscribeToken:token,senderIdentity:'LabTicker offline fixture',senderContact:'Fixture contact only'});assert.ok(message);assert.ok(!message.html.includes('<script>'));
  const [digest]=await db.insert(schema.digests).values({userId:user.id,scheduledFor:windowEnd,windowFrom:subscribedAt,windowTo:windowEnd,idempotencyKey:'digest/offline-fixture',payload:message}).returning();assert.ok(digest);
  await db.insert(schema.digestItems).values(selected.map(r=>({digestId:digest.id,releaseId:r.id,snapshot:r})));
  assert.equal((await db.select().from(schema.deliveryReceipts)).length,0);
  const gateway=new MockEmailGateway();
  // Simulate acceptance before a receipt transaction, then retry the same persisted payload/key.
  const first=await gateway.send(message,digest.idempotencyKey);
  const [persisted]=await db.select().from(schema.digests).where(eq(schema.digests.id,digest.id));assert.ok(persisted);assert.deepEqual(persisted.payload,message);
  const retried=await gateway.send(persisted.payload as EmailMessage,persisted.idempotencyKey);assert.deepEqual(first,retried);assert.equal(gateway.inbox.length,1);
  await db.transaction(async tx=>{
   await tx.insert(schema.deliveryReceipts).values(selected.map(r=>({userId:user.id,releaseId:r.id,digestId:digest.id,resendId:retried.id,acceptedAt:windowEnd})));
   await tx.update(schema.digests).set({status:'sent',resendId:retried.id,sentAt:windowEnd}).where(eq(schema.digests.id,digest.id));
  });
  await insertBatch(true); // An initial/backfill replay must not overwrite first-seen or eligibility metadata.
  assert.equal((await db.select().from(schema.releases))[0]?.isBackfill,false);
  const delivered=new Set((await db.select().from(schema.deliveryReceipts)).map(r=>r.releaseId));
  assert.equal(eligibleReleases(await audience(),candidates,delivered,windowEnd).length,0);
  assert.equal(composeDigest({to:user.email,releases:[],origin:'https://assigned-fixture.fly.dev',unsubscribeToken:token,senderIdentity:'Fixture',senderContact:'Fixture'}),null);
  // Unsubscribe is purpose-verified before suppression, independent of a login session.
  assert.equal(verifyUnsubscribe(token,'fixture-signing-key-'.repeat(3),observedAt),user.id);
  await db.update(schema.users).set({suppressedAt:windowEnd}).where(eq(schema.users.id,user.id));
  assert.equal(eligibleReleases(await audience(),candidates,new Set(),windowEnd).length,0);
  await assert.rejects(gateway.send({...message,text:'changed after retry'},digest.idempotencyKey));
 } finally {await client.close();}
});
