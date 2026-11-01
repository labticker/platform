import assert from 'node:assert/strict';
import test from 'node:test';
import { isPublicAddress, SafeHttpClient, validateFetchUrl } from '../src/safe-http.js';
import type { HttpDependencies, HttpReply, PinnedRequest } from '../src/safe-http.js';

const publicAddress = { address: '140.82.112.5', family: 4 };
function reply(extra: Partial<HttpReply> = {}): HttpReply { return { status: 200, headers: {}, body: '[]', ...extra }; }
function dependencies(send: HttpDependencies['send'], resolve: HttpDependencies['resolve'] = async () => [publicAddress]): HttpDependencies {
  return { send, resolve };
}

test('fetch destinations reject private/reserved/mapped IPs, credentials and host tricks', () => {
  for (const address of ['0.0.0.0', '10.1.2.3', '100.64.0.1', '127.0.0.1', '169.254.169.254', '172.31.0.1',
    '192.168.1.1', '198.18.0.1', '192.0.2.1', '203.0.113.1', '224.0.0.1', '255.255.255.255',
    '::1', '::ffff:127.0.0.1', '::ffff:140.82.112.5', 'fc00::1', 'fe80::1', '2001:db8::1', '2002::1']) {
    assert.equal(isPublicAddress(address), false, address);
  }
  assert.equal(isPublicAddress(publicAddress.address), true);
  assert.equal(isPublicAddress('2606:4700::1111'), true);
  for (const url of ['http://api.github.com', 'https://api.github.com.evil.example', 'https://api.github.com.',
    'https://api.github.com:444', 'https://user:pass@api.github.com', 'https://api.github.com/#token',
    'https://127.1', 'https://[::1]']) assert.throws(() => validateFetchUrl(url, ['api.github.com']));
});

test('DNS validation checks every answer and fails before transport on private resolution', async () => {
  let sent = false;
  const client = new SafeHttpClient({ allowedHosts: ['api.github.com'] }, dependencies(async () => { sent = true; return reply(); },
    async () => [publicAddress, { address: '127.0.0.1', family: 4 }]));
  await assert.rejects(client.get('https://api.github.com'), /non-public/);
  assert.equal(sent, false);
  const mismatch = new SafeHttpClient({ allowedHosts: ['api.github.com'] }, dependencies(async () => reply(), async () => [{ address: '140.82.112.5', family: 6 }]));
  await assert.rejects(mismatch.get('https://api.github.com'), /non-public/);
});
test('CI release credential never permits a second host or cross-host redirect',async()=>{
 let captured:PinnedRequest|undefined;
 const client=new SafeHttpClient({allowedHosts:['api.github.com'],githubToken:'fixture_CI_token'},dependencies(async request=>{captured=request;return reply({status:302,headers:{location:'https://example.com/private'}});}));
 await assert.rejects(client.get('https://api.github.com/repos/fixture/project/releases'),/not approved/);
 assert.equal(captured?.headers.authorization,'Bearer fixture_CI_token');
 await assert.rejects(new SafeHttpClient({allowedHosts:['api.github.com','example.com'],githubToken:'fixture_CI_token'}).get('https://api.github.com'),/credential policy/);
 await assert.rejects(new SafeHttpClient({allowedHosts:['api.github.com'],githubToken:'private\r\ninjected'}).get('https://api.github.com'),/credential policy/);
});

test('validated DNS answer is passed to pinned transport and conditional requests are bounded', async () => {
  let captured: PinnedRequest | undefined;
  const client = new SafeHttpClient({ allowedHosts: ['api.github.com'] }, dependencies(async (request) => { captured = request; return reply(); }));
  await client.get('https://api.github.com/repos/owner/project/releases', { etag: '"abc"', lastModified: 'Fri, 30 Oct 2026 01:00:00 GMT' });
  assert.deepEqual(captured?.address, publicAddress);
  assert.equal(captured?.headers['if-none-match'], '"abc"');
  assert.equal(captured?.headers['accept-encoding'], 'identity');
  assert.equal(captured?.maxBytes, 2_097_152);
  await assert.rejects(client.get('https://api.github.com', { etag: 'bad\r\nAuthorization: secret' }), /Invalid conditional/);
});

test('each redirect revalidates hostname and DNS, preventing redirect SSRF and rebinding', async () => {
  let sent = 0;
  const unsafe = new SafeHttpClient({ allowedHosts: ['api.github.com'] }, dependencies(async () => {
    sent++; return reply({ status: 302, headers: { location: 'https://169.254.169.254/latest/meta-data' } });
  }));
  await assert.rejects(unsafe.get('https://api.github.com'), /not approved/);
  assert.equal(sent, 1);
  let resolutions = 0;
  const rebinding = new SafeHttpClient({ allowedHosts: ['api.github.com'] }, dependencies(async () =>
    reply({ status: 301, headers: { location: '/renamed' } }), async () => ++resolutions === 1 ? [publicAddress] : [{ address: '10.0.0.1', family: 4 }]));
  await assert.rejects(rebinding.get('https://api.github.com'), /non-public/);
  assert.equal(resolutions, 2);
});

test('redirect loops, response overflow and DNS/response stalls fail within bounds', async () => {
  let hops = 0;
  const loop = new SafeHttpClient({ allowedHosts: ['api.github.com'], maxRedirects: 2 }, dependencies(async () => {
    hops++; return reply({ status: 302, headers: { location: '/' } });
  }));
  await assert.rejects(loop.get('https://api.github.com'), /redirect limit/);
  assert.equal(hops, 3);
  const oversized = new SafeHttpClient({ allowedHosts: ['api.github.com'], maxBytes: 10 }, dependencies(async () => reply({ body: '🌎'.repeat(3) })));
  await assert.rejects(oversized.get('https://api.github.com'), /maximum size/);
  const stalledDns = new SafeHttpClient({ allowedHosts: ['api.github.com'], timeoutMs: 20 }, dependencies(async () => reply(), () => new Promise(() => {})));
  await assert.rejects(stalledDns.get('https://api.github.com'), /timed out/);
  let signal: AbortSignal | undefined;
  const stalledBody = new SafeHttpClient({ allowedHosts: ['api.github.com'], timeoutMs: 20 }, dependencies(async (request) => {
    signal = request.signal; return new Promise(() => {});
  }));
  await assert.rejects(stalledBody.get('https://api.github.com'), /timed out/);
  assert.equal(signal?.aborted, true);
});
