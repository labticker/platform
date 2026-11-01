import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';

export function appOrigin(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash || url.port) throw new Error('APP_URL must be an exact HTTPS origin');
  return url.origin;
}
export function appLink(origin: string, path: '/settings' | '/unsubscribe', token?: string): string {
  const url = new URL(path, appOrigin(origin));
  if (token) url.searchParams.set('token', token);
  return url.href;
}
export function assertMockDelivery(config: { mode?: string; publicEmailEnabled?: boolean }): void {
  if ((config.mode ?? 'mock') !== 'mock' || config.publicEmailEnabled === true) throw new Error('Public email is not enabled in the mock implementation');
}
export type Cadence = 'daily' | 'weekly';
/** Searches UTC minutes so DST and fractional-offset zones follow their actual local clock. */
export function nextDigestAt(after: Date, cadence: Cadence, timezone: string): Date {
  if (!Number.isFinite(after.getTime()) || !['daily', 'weekly'].includes(cadence)) throw new Error('Invalid schedule');
  const format = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const start = Math.floor(after.getTime() / 60000) * 60000 + 60000;
  for (let minute = 0; minute < 9 * 24 * 60; minute++) {
    const date = new Date(start + minute * 60000);
    const parts = Object.fromEntries(format.formatToParts(date).map(part => [part.type, part.value]));
    if (parts.hour === '09' && parts.minute === '00' && (cadence === 'daily' || parts.weekday === 'Mon')) return date;
  }
  throw new Error('No schedule found');
}

export interface DigestRelease {
  id: string; appId: string; appName: string; title: string; version: string;
  releaseUrl: string; notes: string; firstSeenAt: Date; publishedAt: Date | null;
  isBackfill: boolean; warnings: readonly string[];
}
export interface DigestAudience {
  verified: boolean; consented: boolean; enabled: boolean; suppressed: boolean;
  subscriptions: readonly { appId: string; enabledAt: Date; active: boolean }[];
}
export function eligibleReleases(audience: DigestAudience, releases: readonly DigestRelease[], delivered: ReadonlySet<string>, windowEnd: Date): DigestRelease[] {
  if (!audience.verified || !audience.consented || !audience.enabled || audience.suppressed) return [];
  const monitors = new Map(audience.subscriptions.filter(s => s.active).map(s => [s.appId, s.enabledAt]));
  const seen = new Set<string>();
  return releases.filter(release => {
    const enabledAt = monitors.get(release.appId);
    if (!enabledAt || release.isBackfill || delivered.has(release.id) || seen.has(release.id) || !(release.firstSeenAt > enabledAt) || !(release.firstSeenAt <= windowEnd)) return false;
    seen.add(release.id); return true;
  }).sort((a,b) => Number(b.warnings.length > 0) - Number(a.warnings.length > 0) || (b.publishedAt ?? b.firstSeenAt).getTime() - (a.publishedAt ?? a.firstSeenAt).getTime());
}
function signingKey(secret: string): void { if (Buffer.byteLength(secret) < 32) throw new Error('Signing key must be at least 32 bytes'); }
export function signUnsubscribe(subject: string, expiresAt: Date, secret: string): string {
  signingKey(secret);
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(subject) || !Number.isFinite(expiresAt.getTime())) throw new Error('Invalid unsubscribe claims');
  const body = Buffer.from(JSON.stringify({ purpose: 'unsubscribe', sub: subject, exp: Math.floor(expiresAt.getTime()/1000) })).toString('base64url');
  return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
}
export function verifyUnsubscribe(token: string, secret: string, now = new Date()): string | null {
  signingKey(secret);
  if (token.length > 1024 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) return null;
  const [body, signature] = token.split('.') as [string,string];
  const expected = createHmac('sha256', secret).update(body).digest();
  const provided = Buffer.from(signature, 'base64url');
  if (provided.length !== expected.length || !timingSafeEqual(provided,expected)) return null;
  try {
    const claims: unknown = JSON.parse(Buffer.from(body,'base64url').toString());
    if (!claims || typeof claims !== 'object') return null;
    const c = claims as Record<string,unknown>;
    return c.purpose === 'unsubscribe' && typeof c.sub === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(c.sub) && typeof c.exp === 'number' && Number.isSafeInteger(c.exp) && c.exp > now.getTime()/1000 ? c.sub : null;
  } catch { return null; }
}
export interface EmailMessage { to: string; subject: string; html: string; text: string; headers: Readonly<Record<string,string>>; }
export interface EmailGateway { send(message: EmailMessage, idempotencyKey: string): Promise<{ id: string }>; }
/** Local fixture inbox only; no network, logs, persistence, or provider calls. */
export class MockEmailGateway implements EmailGateway {
  readonly deliveryMode='mock' as const;
  readonly inbox: EmailMessage[] = [];
  private readonly accepted = new Map<string,{hash:string; id:string}>();
  async send(message: EmailMessage, idempotencyKey: string): Promise<{id:string}> {
    if (!idempotencyKey || /[\r\n]/.test(message.to + message.subject)) throw new Error('Invalid email envelope');
    // JSONB reorders object keys. Canonical field/header ordering keeps persisted retries stable.
    const payload = [message.to,message.subject,message.html,message.text,Object.entries(message.headers).sort(([a],[b])=>a.localeCompare(b))];
    const hash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    const previous = this.accepted.get(idempotencyKey);
    if (previous) { if (previous.hash !== hash) throw new Error('Idempotency payload changed'); return {id:previous.id}; }
    const id = `mock_${createHash('sha256').update(idempotencyKey).digest('hex')}`;
    this.accepted.set(idempotencyKey,{hash,id}); this.inbox.push(structuredClone(message)); return {id};
  }
}
const escape = (text: string) => text.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
/** Static link policy; upstream fetchers must additionally enforce DNS/redirect egress safety. */
function releaseLink(value: string): string {
  const u = new URL(value);
  const host = u.hostname.toLowerCase();
  if (u.protocol !== 'https:' || u.username || u.password || u.hash || u.port ||
      isIP(host) || host.startsWith('[') || !host.includes('.') || host.endsWith('.') ||
      /(^|\.)(localhost|local|internal|invalid|test|home|lan)$/.test(host)) throw new Error('Unsafe release URL');
  return u.href;
}
function assertUnsubscribeToken(token: string): void {
  if (token.length > 1024 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token)) throw new Error('Malformed unsubscribe token');
  const [body,signature] = token.split('.') as [string,string];
  if (Buffer.from(signature,'base64url').toString('base64url') !== signature || Buffer.from(body,'base64url').toString('base64url') !== body) throw new Error('Malformed unsubscribe token');
  try {
    const c:unknown = JSON.parse(Buffer.from(body,'base64url').toString('utf8'));
    if (!c || typeof c !== 'object' || Array.isArray(c)) throw new Error();
    const claims = c as Record<string,unknown>;
    if (claims.purpose !== 'unsubscribe' || typeof claims.sub !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(claims.sub) || typeof claims.exp !== 'number' || !Number.isSafeInteger(claims.exp) || claims.exp <= 0) throw new Error();
  } catch { throw new Error('Malformed unsubscribe token'); }
}
export function composeDigest(input: { to:string; releases:readonly DigestRelease[]; origin:string; unsubscribeToken:string; senderIdentity:string; senderContact:string }): EmailMessage | null {
  if (input.releases.length === 0) return null;
  if (!input.senderIdentity.trim() || !input.senderContact.trim()) throw new Error('Sender identity/contact required');
  // Structural check only: HTTP handlers verify signature and expiry using the private signing key.
  assertUnsubscribeToken(input.unsubscribeToken);
  const unsubscribe = appLink(input.origin,'/unsubscribe',input.unsubscribeToken);
  const settings = appLink(input.origin,'/settings');
  const textItems = input.releases.map(r => `${r.appName} — ${r.version}: ${r.title}\n${r.warnings.join('; ')}\n${r.notes.slice(0,600)}\n${releaseLink(r.releaseUrl)}`).join('\n\n');
  const htmlItems = input.releases.map(r => `<article><h2>${escape(r.appName)} — ${escape(r.version)}</h2><p>${escape(r.title)}</p><p>${escape(r.warnings.join('; '))}</p><p>${escape(r.notes.slice(0,600))}</p><a href="${escape(releaseLink(r.releaseUrl))}">View upstream release notes</a></article>`).join('');
  return { to:input.to, subject:`Your LabTicker updates — ${input.releases.length} new releases`,
    text:`LabTicker\nUpdate your homelab. Without the homework.\n\n${textItems}\n\nLabels are advisory; review upstream instructions.\nManage preferences: ${settings}\nUnsubscribe: ${unsubscribe}\n${input.senderIdentity}\n${input.senderContact}`,
    html:`<!doctype html><html><body><h1>LabTicker</h1><p>Update your homelab. Without the homework.</p>${htmlItems}<p>Labels are advisory; review upstream instructions.</p><footer><a href="${escape(settings)}">Manage preferences</a> | <a href="${escape(unsubscribe)}">Unsubscribe</a><p>${escape(input.senderIdentity)}<br>${escape(input.senderContact)}</p></footer></body></html>`,
    headers:{'List-Unsubscribe':`<${unsubscribe}>`,'List-Unsubscribe-Post':'List-Unsubscribe=One-Click'} };
}
