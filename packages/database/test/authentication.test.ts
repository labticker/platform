import {test} from 'node:test';import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';import {drizzle} from 'drizzle-orm/pglite';import {migrate} from 'drizzle-orm/pglite/migrator';
import {eq} from 'drizzle-orm';import * as schema from '../src/schema.js';import {recordSuccessfulSignIn,recordDashboardVisit} from '../src/authentication.js';
test('verified sign-in records one recoverable signup baseline and separate login engagement without changing the cohort',async()=>{
 const client=new PGlite(),db=drizzle(client,{schema});try{await migrate(db,{migrationsFolder:'../../drizzle'});
  const [user]=await db.insert(schema.users).values({email:'auth-fixture@example.invalid'}).returning();assert.ok(user);
  const first=new Date('2026-01-01T12:00Z'),later=new Date('2026-01-25T12:00Z');
  await assert.rejects(recordSuccessfulSignIn(db,user.id,false,first),/Verified account/);
  await recordSuccessfulSignIn(db,user.id,true,first);await recordSuccessfulSignIn(db,user.id,true,later);
  assert.equal((await db.select().from(schema.users))[0]?.emailVerified?.getTime(),first.getTime());
  const events=await db.select().from(schema.accountStateEvents);assert.equal(events.filter(e=>e.eventType==='verified_signup').length,1);assert.equal(events.filter(e=>e.eventType==='dashboard_login').length,2);
  assert.equal(events.find(e=>e.eventType==='verified_signup')?.occurredAt.getTime(),first.getTime());
  await recordDashboardVisit(db,user.id,later);await recordDashboardVisit(db,user.id,new Date(later.getTime()+1000));await recordDashboardVisit(db,user.id,new Date(later.getTime()+86400000));
  assert.equal((await db.select().from(schema.accountStateEvents)).filter(e=>e.eventType==='dashboard_view').length,2);
  await recordSuccessfulSignIn(db,user.id,false,later,true);assert.equal((await db.select().from(schema.users))[0]?.role,'user');
  await recordSuccessfulSignIn(db,user.id,true,later,true);assert.equal((await db.select().from(schema.users))[0]?.role,'admin');
  await db.delete(schema.accountStateEvents).where(eq(schema.accountStateEvents.eventType,'verified_signup'));
  await recordSuccessfulSignIn(db,user.id,true,later);
  assert.equal((await db.select().from(schema.accountStateEvents)).find(e=>e.eventType==='verified_signup')?.occurredAt.getTime(),first.getTime());
  await db.update(schema.users).set({deletedAt:later}).where(eq(schema.users.id,user.id));await assert.rejects(recordSuccessfulSignIn(db,user.id,true,later),/Verified account/);
 }finally{await client.close();}
});
