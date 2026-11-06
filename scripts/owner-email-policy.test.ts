import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ownerEmailPolicy} from './owner-email-policy.js';
import {mkdtemp,copyFile,readFile,unlink,rmdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
const evidence={ownerApproval:{decision:'private-email-test-approved',reference:'fixture-private'},appUrl:'https://fixture.fly.dev',sender:{address:'updates@example.org',domain:'example.org',status:'verified',evidenceReference:'fixture-verified',checkedAt:'2026-01-01'},trackingReview:{reference:'fixture-tracking-off',authOpenTracking:false,authClickTracking:false,digestOpenTracking:false,digestClickTracking:false},recipients:['owner@example.org'],senderIdentity:'Fixture',senderContact:'Fixture contact'};
const env={ACTUAL_APP:'fixture',ROLLOUT_STAGE:'owner-email-pilot',EMAIL_DELIVERY_MODE:'resend',EMAIL_AUTH_ENABLED:'false',EMAIL_TEST_ENABLED:'false',RESEND_API_KEY:'fixture-not-a-key',LIVE_EMAIL_APPROVAL_REFERENCE:'owner-scheduled-email-approved/fixture',EMAIL_TEST_APPROVAL_JSON:JSON.stringify(evidence)};
test('owner schedule rollout needs a separate explicit decision and binds the reviewed single recipient',()=>{
 const config=ownerEmailPolicy(env);assert.equal(config.publicEmailEnabled,false);assert.deepEqual(config.audience,{kind:'owner-only',recipients:['owner@example.org']});assert.equal(config.ownerApproval?.reference,env.LIVE_EMAIL_APPROVAL_REFERENCE);
 for(const patch of [{ROLLOUT_STAGE:'public-pilot'},{EMAIL_DELIVERY_MODE:'mock'},{EMAIL_AUTH_ENABLED:'true'},{EMAIL_TEST_ENABLED:'true'},{LIVE_EMAIL_APPROVAL_REFERENCE:''},{LIVE_EMAIL_APPROVAL_REFERENCE:'fixture-private'},{RESEND_API_KEY:''},{ACTUAL_APP:'different'}])assert.throws(()=>ownerEmailPolicy({...env,...patch}));
 assert.throws(()=>ownerEmailPolicy({...env,EMAIL_TEST_APPROVAL_JSON:JSON.stringify({...evidence,recipients:['owner@example.org','other@example.org']})}));
 assert.throws(()=>ownerEmailPolicy({...env,EMAIL_TEST_APPROVAL_JSON:JSON.stringify({...evidence,trackingReview:{...evidence.trackingReview,digestOpenTracking:true}})}));
});
test('generated owner rollout keeps enrollment closed and private sender details out of TOML',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'labticker-owner-rollout-'));
 try{
  await copyFile('fly.pilot.example.toml',join(directory,'fly.pilot.example.toml'));
  const result=spawnSync(process.execPath,['--import',pathToFileURL(resolve('node_modules/tsx/dist/loader.mjs')).href,resolve('scripts/configure-pilot.ts')],{cwd:directory,env:{...process.env,...env,RESEND_WEBHOOK_SECRET:'fixture-webhook'},encoding:'utf8',timeout:30000});
  assert.equal(result.status,0,result.stderr);
  const configuration=await readFile(join(directory,'fly.toml'),'utf8');
  assert.match(configuration,/OWNER_ACCEPTANCE_ONLY = "true"/);assert.match(configuration,/PUBLIC_EMAIL_ENABLED = "false"/);
  assert.match(configuration,/EMAIL_DELIVERY_MODE = "resend"/);assert.match(configuration,/EMAIL_TEST_ENABLED = "false"/);assert.match(configuration,/WORKER_MODE = "digest-pilot"/);
  assert.doesNotMatch(configuration,/owner@example|updates@example|SENDER_CONTACT|POSTHOG_PROJECT_ID/);
 }finally{await Promise.all(['fly.toml','fly.pilot.example.toml'].map(name=>unlink(join(directory,name)).catch(()=>{})));await rmdir(directory);}
});
