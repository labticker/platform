import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { BlockList, isIP } from 'node:net';

export interface ResolvedAddress { readonly address: string; readonly family: number }
export interface HttpReply {
  readonly status: number;
  readonly headers: Readonly<Record<string, string | undefined>>;
  readonly body: string;
}
export interface RequestPolicy {
  readonly allowedHosts: readonly string[];
  readonly timeoutMs?: number;
  readonly maxBytes?: number;
  readonly maxRedirects?: number;
}
export interface PinnedRequest {
  readonly url: URL;
  readonly address: ResolvedAddress;
  readonly headers: Readonly<Record<string, string>>;
  readonly maxBytes: number;
  readonly signal: AbortSignal;
}
export interface HttpDependencies {
  readonly resolve: (host: string) => Promise<readonly ResolvedAddress[]>;
  readonly send: (request: PinnedRequest) => Promise<HttpReply>;
}

const blockedV4 = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) blockedV4.addSubnet(address, prefix, 'ipv4');
const globalV6 = new BlockList();
globalV6.addSubnet('2000::', 3, 'ipv6');
const blockedV6 = new BlockList();
// Conservative policy: exclude protocol-assignment, documentation and transition ranges.
for (const [address, prefix] of [['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['3fff::', 20]] as const) {
  blockedV6.addSubnet(address, prefix, 'ipv6');
}

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !blockedV4.check(address, 'ipv4');
  if (family === 6) return globalV6.check(address, 'ipv6') && !blockedV6.check(address, 'ipv6');
  return false;
}

export function validateFetchUrl(value: string | URL, allowedHosts: readonly string[]): URL {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || (url.port && url.port !== '443')) {
    throw new Error('Release source requires HTTPS without credentials, fragments or custom ports');
  }
  if (!allowedHosts.includes(url.hostname) || isIP(url.hostname) || url.hostname.startsWith('[')) {
    throw new Error('Release source hostname is not approved');
  }
  return url;
}

/** Does not use the global connection pool: the DNS answer is checked and pinned to this TLS request. */
export const sendPinnedHttps: HttpDependencies['send'] = ({ url, address, headers, maxBytes, signal }) =>
  new Promise<HttpReply>((resolve, reject) => {
    const req = request(url, {
      method: 'GET', agent: false, signal, headers,
      family: address.family,
      lookup: (_hostname, _options, callback) => callback(null, address.address, address.family),
      // URL hostname remains the TLS server name; normal certificate verification stays enabled.
    }, (res) => {
      res.on('error', reject);
      const status = res.statusCode ?? 0;
      const contentLength = res.headers['content-length'];
      if (contentLength && (!/^\d+$/.test(contentLength) || Number(contentLength) > maxBytes)) {
        res.destroy(new Error('Release response exceeds maximum size')); return;
      }
      if (res.headers['content-encoding'] && res.headers['content-encoding'] !== 'identity') {
        res.destroy(new Error('Compressed release responses are not accepted')); return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      res.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > maxBytes) { res.destroy(new Error('Release response exceeds maximum size')); return; }
        chunks.push(chunk);
      });
      res.on('end', () => {
        const responseHeaders: Record<string, string | undefined> = {};
        for (const name of ['etag', 'last-modified', 'location', 'content-type', 'retry-after']) {
          const value = res.headers[name];
          responseHeaders[name] = Array.isArray(value) ? value[0] : value;
        }
        resolve({ status, headers: responseHeaders, body: Buffer.concat(chunks).toString('utf8') });
      });
    });
    req.on('error', reject);
    req.end();
  });

const defaults: HttpDependencies = {
  resolve: (host) => lookup(host, { all: true, verbatim: true }),
  send: sendPinnedHttps,
};

export class SafeHttpClient {
  constructor(private readonly policy: RequestPolicy, private readonly dependencies: HttpDependencies = defaults) {}

  async get(value: string, conditional: { etag?: string; lastModified?: string } = {}): Promise<HttpReply> {
    const timeoutMs = this.policy.timeoutMs ?? 10_000;
    const maxBytes = this.policy.maxBytes ?? 2_097_152;
    const maxRedirects = this.policy.maxRedirects ?? 3;
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000 ||
        !Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > 8_388_608 ||
        !Number.isInteger(maxRedirects) || maxRedirects < 0 || maxRedirects > 5) {
      throw new Error('Invalid bounded HTTP policy');
    }
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const expired = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error('Release request timed out')); }, timeoutMs);
    });
    const run = async (): Promise<HttpReply> => {
      let url = validateFetchUrl(value, this.policy.allowedHosts);
      for (let hop = 0; hop <= maxRedirects; hop++) {
        const addresses = await this.dependencies.resolve(url.hostname);
        if (controller.signal.aborted) throw new Error('Release request timed out');
        if (!addresses.length || addresses.some((entry) => !isPublicAddress(entry.address) || isIP(entry.address) !== entry.family)) {
          throw new Error('Release source DNS contains a non-public address');
        }
        const address = addresses[0]!;
        const headers: Record<string, string> = {
          'user-agent': 'LabTicker/0.1 release-monitor', accept: 'application/vnd.github+json',
          'accept-encoding': 'identity',
        };
        for (const [name, candidate] of [['if-none-match', conditional.etag], ['if-modified-since', conditional.lastModified]] as const) {
          if (candidate !== undefined) {
            if (candidate.length > 1024 || /[\r\n]/.test(candidate)) throw new Error('Invalid conditional HTTP header');
            headers[name] = candidate;
          }
        }
        const reply = await this.dependencies.send({ url, address, headers, maxBytes, signal: controller.signal });
        if (Buffer.byteLength(reply.body, 'utf8') > maxBytes) throw new Error('Release response exceeds maximum size');
        if (![301, 302, 303, 307, 308].includes(reply.status)) return reply;
        if (hop === maxRedirects || !reply.headers.location) throw new Error('Release redirect limit or location invalid');
        url = validateFetchUrl(new URL(reply.headers.location, url), this.policy.allowedHosts);
      }
      throw new Error('Release redirect limit exceeded');
    };
    try { return await Promise.race([run(), expired]); }
    finally { if (timer) clearTimeout(timer); controller.abort(); }
  }
}
