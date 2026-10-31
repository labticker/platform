import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as schema from '../src/schema.js';
import { upsertCatalogEntry, type CatalogUpsert } from '../src/catalog.js';

test('Postgres migration and catalog corrections retain subscriptions and release history', async () => {
  const client = new PGlite();
  const db = drizzle(client,{schema});
  try {
    await migrate(db,{migrationsFolder:'../../drizzle'});
    const input:CatalogUpsert={externalId:'stable-project',provider:'custom_json',sourceHash:'first',gitCommit:'fixture-commit',provenanceUrl:'catalog/services/original.json',slug:'original',name:'Original',description:'Original fixture description',category:'monitoring',homepageUrl:'https://example.com',repoUrl:'https://github.com/example/project'};
    const appId = await upsertCatalogEntry(db,input);
    const [user] = await db.insert(schema.users).values({email:'fixture@example.com'}).returning();
    assert.ok(user);
    await db.insert(schema.subscriptions).values({userId:user.id,applicationId:appId,enabledAt:new Date()});
    const [source] = await db.insert(schema.releaseSources).values({applicationId:appId,provider:'github-releases',url:'https://api.github.com/repos/example/project/releases',externalKey:'example/project'}).returning();
    assert.ok(source);
    const release={applicationId:appId,releaseSourceId:source.id,dedupeKey:'url:fixture',title:'Release fixture',releaseUrl:'https://github.com/example/project/releases/tag/v1',notesText:'Fixture',firstSeenAt:new Date()};
    await db.insert(schema.releases).values(release);
    const renamedId=await upsertCatalogEntry(db,{...input,sourceHash:'second',slug:'renamed',name:'Renamed',repoUrl:undefined});
    assert.equal(renamedId,appId);
    assert.equal((await db.select().from(schema.subscriptions))[0]?.applicationId,appId);
    assert.equal((await db.select().from(schema.releases)).length,1);
    assert.equal((await db.select().from(schema.applications))[0]?.repoUrl,input.repoUrl);
    assert.equal((await db.select().from(schema.appAliases))[0]?.alias,'original');
    assert.equal((await db.select().from(schema.catalogChanges)).length,2);
    await assert.rejects(db.insert(schema.releases).values(release));
    await assert.rejects(db.insert(schema.users).values({email:'FIXTURE@example.com'}));
    await assert.rejects(upsertCatalogEntry(db,{...input,externalId:'different-project',slug:'renamed'}));
    await assert.rejects(upsertCatalogEntry(db,{...input,provider:'selfhst',slug:'renamed'}));
    await assert.rejects(upsertCatalogEntry(db,{...input,externalId:'different-project',slug:'original'}));
    await assert.rejects(upsertCatalogEntry(db,{...input,slug:'renamed',name:'   '}));
    assert.equal((await db.select().from(schema.applications)).length,1);
    // Re-running migration is safe and does not re-create or erase data.
    await migrate(db,{migrationsFolder:'../../drizzle'});
    assert.equal((await db.select().from(schema.subscriptions)).length,1);
  } finally { await client.close(); }
});

test('Postgres enforces provider replay, digest window, receipt and aggregate uniqueness', async () => {
  const client = new PGlite();
  const db = drizzle(client,{schema});
  try {
    await migrate(db,{migrationsFolder:'../../drizzle'});
    const event={providerEventId:'evt_fixture',eventType:'email.delivered',resendEmailId:'msg_fixture'};
    await db.insert(schema.resendWebhookEvents).values(event);
    await assert.rejects(db.insert(schema.resendWebhookEvents).values(event));
    const [user]=await db.insert(schema.users).values({email:'second@example.com'}).returning();assert.ok(user);
    const digest={userId:user.id,scheduledFor:new Date(),windowFrom:new Date(0),windowTo:new Date(),idempotencyKey:'digest/fixture'};
    const [storedDigest]=await db.insert(schema.digests).values(digest).returning();assert.ok(storedDigest);
    await assert.rejects(db.insert(schema.digests).values({...digest,idempotencyKey:'digest/different'}));
    await assert.rejects(db.insert(schema.preferences).values({userId:user.id,frequency:'hourly'}));
    const [app]=await db.insert(schema.applications).values({slug:'receipt-fixture',name:'Receipt fixture',description:'Receipt fixture app',category:'monitoring',homepageUrl:'https://example.com'}).returning();assert.ok(app);
    const [source]=await db.insert(schema.releaseSources).values({applicationId:app.id,provider:'rss',url:'https://example.com/feed',externalKey:'receipt-fixture'}).returning();assert.ok(source);
    const [release]=await db.insert(schema.releases).values({applicationId:app.id,releaseSourceId:source.id,dedupeKey:'fixture',title:'Fixture',releaseUrl:'https://example.com/release',notesText:'Fixture',firstSeenAt:new Date()}).returning();assert.ok(release);
    const receipt={userId:user.id,releaseId:release.id,digestId:storedDigest.id,resendId:'msg_fixture',acceptedAt:new Date()};
    await db.insert(schema.deliveryReceipts).values(receipt);
    await assert.rejects(db.insert(schema.deliveryReceipts).values(receipt));
    const aggregate={metricDate:'2026-10-30',metricName:'verified_signups',dimensionKey:'all',metricValue:1,computedAt:new Date()};
    await db.insert(schema.analyticsDailyAggregates).values(aggregate);
    await assert.rejects(db.insert(schema.analyticsDailyAggregates).values(aggregate));
    await assert.rejects(db.insert(schema.analyticsDailyAggregates).values({...aggregate,dimensionKey:'negative',metricValue:-1}));
  } finally { await client.close(); }
});
