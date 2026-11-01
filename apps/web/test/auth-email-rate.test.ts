import {test} from 'node:test';import assert from 'node:assert/strict';import {createAuthEmailLimiter,normalizeEmailIdentifier} from '../lib/auth-email-rate';
test('email identifiers normalize before lookup and reject recipient/header confusion',()=>{
 assert.equal(normalizeEmailIdentifier(' Fixture@Example.COM '),'fixture@example.com');
 for(const address of ['fixture@example.com\r\nbcc:other@example.com','"fixture"@example.com','fixture＠evil.com@example.com','fixture@example..com','fixture@-example.com','fixture@localhost'])assert.throws(()=>normalizeEmailIdentifier(address),/Invalid email/);
});
test('email requests have per-address and global quota guards before creating tokens or sending messages',()=>{
 const allow=createAuthEmailLimiter(),secret='fixture-only-key-01234567890123456789',now=Date.parse('2026-11-01');
 for(let i=0;i<3;i++)assert.equal(allow('fixture@example.invalid',secret,now),true);
 assert.equal(allow('fixture@example.invalid',secret,now),false);
 for(let i=0;i<22;i++)assert.equal(allow(`fixture-${i}@example.invalid`,secret,now),true);
 assert.equal(allow('other@example.invalid',secret,now),false);
 assert.equal(allow('other@example.invalid',secret,now+86400000),true);
 assert.equal(allow('other@example.invalid','short',now),false);
});
