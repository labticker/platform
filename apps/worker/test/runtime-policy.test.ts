import {test} from 'node:test';import assert from 'node:assert/strict';import {workerTickInterval} from '../src/runtime-policy.js';
test('production worker allows free database sleep and rejects unbounded or too-frequent loops',()=>{
 assert.equal(workerTickInterval({NODE_ENV:'production'}),900000);assert.equal(workerTickInterval({NODE_ENV:'development'}),60000);
 assert.equal(workerTickInterval({WORKER_TICK_INTERVAL_MS:'300000'}),300000);
 for(const value of ['0','-1','59999','900001','Infinity','1e5','60000 private'])assert.throws(()=>workerTickInterval({WORKER_TICK_INTERVAL_MS:value}),/Invalid worker tick interval/);
});
