import { describe,it,expect } from 'vitest';
import {appOrigin,appLink,assertMockDelivery,nextDigestAt,eligibleReleases,signUnsubscribe,verifyUnsubscribe,composeDigest,MockEmailGateway,type DigestRelease,type DigestAudience} from './core.js';
const release:DigestRelease={id:'r1',appId:'a1',appName:'Fixture',title:'Release',version:'v1.0.0',releaseUrl:'https://github.com/example/project/releases/tag/v1',notes:'Original notes',firstSeenAt:new Date('2026-03-09T10:00:00Z'),publishedAt:null,isBackfill:false,warnings:[]};
const audience:DigestAudience={verified:true,consented:true,enabled:true,suppressed:false,subscriptions:[{appId:'a1',enabledAt:new Date('2026-03-08T10:00:00Z'),active:true}]};
describe('digest core',()=>{
 it('keeps origin exact and public email off',()=>{expect(appOrigin('https://assigned.fly.dev')).toBe('https://assigned.fly.dev');for(const bad of ['http://assigned.fly.dev','https://user:pass@assigned.fly.dev','https://assigned.fly.dev/evil','https://assigned.fly.dev?token=secret'])expect(()=>appOrigin(bad)).toThrow();expect(appLink('https://assigned.fly.dev','/settings')).toBe('https://assigned.fly.dev/settings');expect(()=>assertMockDelivery({mode:'resend'})).toThrow();expect(()=>assertMockDelivery({publicEmailEnabled:true})).toThrow();});
 it('schedules daily across spring DST and weekly across fall DST',()=>{
 expect(nextDigestAt(new Date('2026-03-07T16:00:00Z'),'daily','America/Edmonton').toISOString()).toBe('2026-03-08T15:00:00.000Z');
 expect(nextDigestAt(new Date('2026-10-26T13:00:00Z'),'weekly','America/New_York').toISOString()).toBe('2026-11-02T14:00:00.000Z');
 expect(nextDigestAt(new Date('2026-03-09T00:00:00Z'),'daily','Asia/Kathmandu').toISOString()).toBe('2026-03-09T03:15:00.000Z');
 expect(()=>nextDigestAt(new Date(),'daily','Invalid/Zone')).toThrow();
 });
 it('excludes backfill, prior/delivered/future releases and paused or suppressed audiences',()=>{const end=new Date('2026-03-10T00:00Z');expect(eligibleReleases(audience,[release,release,{...release,id:'backfill',isBackfill:true},{...release,id:'old',firstSeenAt:new Date('2026-03-01')},{...release,id:'future',firstSeenAt:new Date('2026-03-11')}],new Set(),end).map(r=>r.id)).toEqual(['r1']);expect(eligibleReleases(audience,[release],new Set(['r1']),end)).toEqual([]);for(const patch of [{suppressed:true},{enabled:false},{consented:false},{verified:false}])expect(eligibleReleases({...audience,...patch},[release],new Set(),end)).toEqual([]);});
 it('signs purpose-specific expiring tokens and rejects tampering',()=>{const key='fixture-secret-'.repeat(4);const token=signUnsubscribe('opaque-id',new Date('2026-04-01'),key);expect(verifyUnsubscribe(token,key,new Date('2026-03-01'))).toBe('opaque-id');expect(verifyUnsubscribe(token,key,new Date('2026-04-01'))).toBeNull();expect(verifyUnsubscribe(token+'x',key,new Date('2026-03-01'))).toBeNull();expect(verifyUnsubscribe(token,'other-key'.repeat(5),new Date('2026-03-01'))).toBeNull();expect(()=>signUnsubscribe('id',new Date(),'short')).toThrow();});
 it('escapes untrusted notes, remains ad-free and includes one-click headers',async()=>{
 const input={to:'fixture@example.invalid',releases:[{...release,notes:'<script>alert(1)</script><img src="https://ads.invalid/pixel">'}],origin:'https://assigned.fly.dev',unsubscribeToken:signUnsubscribe('fixture',new Date('2027-01-01'),'fixture-secret-'.repeat(4)),senderIdentity:'LabTicker fixture',senderContact:'Test contact'};
 const message=composeDigest(input)!;expect(message.html).not.toContain('<script>');expect(message.html).not.toContain('<img');expect(message.html).not.toContain('iframe');expect(message.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');expect(composeDigest({...input,releases:[]})).toBeNull();
 const gateway=new MockEmailGateway();const first=await gateway.send(message,'digest/fixture');expect(await gateway.send(message,'digest/fixture')).toEqual(first);expect(gateway.inbox).toHaveLength(1);await expect(gateway.send({...message,text:'changed'},'digest/fixture')).rejects.toThrow('payload changed');
 });
 it('rejects local/private literal links, unusual ports and malformed unsubscribe headers',()=>{
 const input={to:'fixture@example.invalid',releases:[release],origin:'https://assigned.fly.dev',unsubscribeToken:signUnsubscribe('fixture',new Date('2027-01-01'),'fixture-secret-'.repeat(4)),senderIdentity:'Fixture',senderContact:'Test contact'};
 for(const url of ['https://localhost/release','https://app.local/release','https://10.0.0.1/release','https://127.1/release','https://0x7f000001/release','https://[::1]/release','https://[::ffff:127.0.0.1]/release','https://metadata.google.internal/release','https://github.com:8443/release','https://user:password@github.com/release','https://github.com/release#fragment']) expect(()=>composeDigest({...input,releases:[{...release,releaseUrl:url}]})).toThrow('Unsafe release URL');
 for(const unsubscribeToken of ['', 'fixture', 'body.signature', input.unsubscribeToken+'\r\nInjected: yes', 'a'.repeat(1025)])expect(()=>composeDigest({...input,unsubscribeToken})).toThrow('Malformed unsubscribe token');
 });
});

