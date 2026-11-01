import {test} from 'node:test';
import assert from 'node:assert/strict';
import {githubOAuthAllowed,signInAllowedByRollout,emailAuthAllowed} from '../lib/auth-policy';
import {verifiedGithubProfile} from '../lib/github-profile';
import {discardProviderTokens} from '../lib/auth-adapter';
test('owner acceptance denies every other provider/account and cannot silently open enrollment',()=>{
 const env={OWNER_ACCEPTANCE_ONLY:'true',ADMIN_GITHUB_ACCOUNT_ID:'42'};
 assert.equal(signInAllowedByRollout(env,{provider:'github',providerAccountId:'42'}),true);
 for(const account of [null,undefined,{provider:'github',providerAccountId:'43'},{provider:'resend-email',providerAccountId:'42'}])assert.equal(signInAllowedByRollout(env,account),false);
 assert.equal(signInAllowedByRollout({...env,ADMIN_GITHUB_ACCOUNT_ID:''},{provider:'github',providerAccountId:'42'}),false);
 assert.equal(emailAuthAllowed({...env,EMAIL_AUTH_ENABLED:'true'}),false);
});
test('account persistence receives no OAuth tokens or scopes',async()=>{
 let stored:unknown;
 const adapter=discardProviderTokens({linkAccount:async account=>{stored=account;}});
 await adapter.linkAccount!({userId:'fixture',type:'oauth',provider:'github',providerAccountId:'42',access_token:'private-token',refresh_token:'private-refresh',id_token:'private-id',scope:'user:email',expires_at:123});
 assert.deepEqual(stored,{userId:'fixture',type:'oauth',provider:'github',providerAccountId:'42'});
});
test('GitHub pilot requires explicit rollout, credentials and exact assigned HTTPS origin',()=>{
 const valid={GITHUB_OAUTH_ENABLED:'true',AUTH_GITHUB_ID:'fixture',AUTH_GITHUB_SECRET:'fixture',DATABASE_URL:'postgres://fixture',AUTH_SECRET:'x'.repeat(32),APP_URL:'https://fixture-labticker.fly.dev',AUTH_URL:'https://fixture-labticker.fly.dev'};
 assert.equal(githubOAuthAllowed(valid),true);
 assert.equal(githubOAuthAllowed({...valid,DATABASE_URL:undefined,WEB_DATABASE_URL:'postgres://scoped-fixture'}),true);
 for(const patch of [{GITHUB_OAUTH_ENABLED:'false'},{AUTH_GITHUB_SECRET:''},{AUTH_SECRET:'short'},{APP_URL:'http://localhost:3000'},{AUTH_URL:'https://other.fly.dev'},{APP_URL:'https://fixture-labticker.fly.dev/?token=private'},{APP_URL:'https://user:pass@fixture-labticker.fly.dev'}])assert.equal(githubOAuthAllowed({...valid,...patch}),false);
});
test('OAuth uses verified primary email only and strips profile enrichment',async()=>{
 const calls:string[]=[];
 const request:typeof fetch=async(input,init)=>{
  calls.push(String(input));assert.equal(init?.redirect,'error');assert.ok(init?.signal);
  return Response.json(String(input).includes('/emails')?[{email:' Fixture@Example.invalid ',primary:true,verified:true}]:{id:42,email:'unverified@example.invalid',name:'Private name',avatar_url:'private-image'});
 };
 assert.deepEqual(await verifiedGithubProfile('fixture-token',request),{id:42,email:'fixture@example.invalid',verified:true});
 assert.deepEqual(calls.sort(),['https://api.github.com/user','https://api.github.com/user/emails?per_page=100'].sort());
 for(const emails of [[],[{email:'fixture@example.invalid',primary:true,verified:false}],[{email:'fixture@example.invalid',primary:false,verified:true}]]){
  await assert.rejects(verifiedGithubProfile('fixture-token',async input=>Response.json(String(input).includes('/emails')?emails:{id:42})),/GitHub verified identity unavailable/);
 }
 await assert.rejects(verifiedGithubProfile('fixture-token',async()=>{throw new Error('private-token private@example.invalid');}),error=>error instanceof Error&&error.message==='GitHub verified identity unavailable'&&!error.cause);
});
