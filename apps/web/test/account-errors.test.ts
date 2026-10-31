import {test} from 'node:test';
import assert from 'node:assert/strict';
import {guardAccount} from '../lib/account-errors';
test('account boundaries replace SQL/provider details while preserving approved user guidance',async()=>{
 const privateFailure=Object.assign(new Error('SQL parameters private@example.com token=fixture'),{cause:{payload:'private'}});
 await assert.rejects(guardAccount(async()=>{throw privateFailure;}),error=>error instanceof Error&&error.message==='Account operation unavailable'&&error.cause===undefined&&!error.stack?.includes('private@example.com'));
 await assert.rejects(guardAccount(async()=>{throw new Error('No supported release source');}),/No supported release source/);
 assert.equal(await guardAccount(async()=>42),42);
});
