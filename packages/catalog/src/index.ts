import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isIP } from 'node:net';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { z } from 'zod';

export const releaseSourceSchema = z.discriminatedUnion('kind', [
  z.object({kind:z.literal('github-releases'),repository:z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),channel:z.literal('stable')}).strict(),
  z.object({kind:z.literal('gitlab-releases'),projectUrl:z.string().url(),channel:z.literal('stable')}).strict(),
  z.object({kind:z.literal('rss'),url:z.string().url()}).strict(),
]);
export const serviceSchema = z.object({
  $schema:z.string().min(1).optional(), schemaVersion:z.literal(1),slug:z.string().min(2).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name:z.string().min(2).max(100),summary:z.string().min(10).max(350),
  category:z.enum(['virtualization','storage','networking','monitoring','media','automation','productivity','security','development','other']),
  aliases:z.array(z.string().min(2).max(100)).max(12).optional(),website:z.string().url(),
  repository:z.object({provider:z.enum(['github','gitlab','other']),url:z.string().url()}).strict().optional(),
  releaseSources:z.array(releaseSourceSchema).max(4),
  catalog:z.union([z.object({mode:z.literal('add')}).strict(),z.object({mode:z.literal('override'),upstreamKey:z.string().min(1).max(200)}).strict()]),
}).strict();
export type Service = z.infer<typeof serviceSchema>;
export type ReleaseSource = z.infer<typeof releaseSourceSchema>;
export interface CatalogRecord { definition:Service; sourceHash:string; provenanceUrl:string; origin:'custom_json'; }
export interface CatalogAdapter { fetchCatalog():Promise<CatalogRecord[]>; }
export interface NormalizedRelease { sourceKey:string;guid:string|null;versionTag:string|null;title:string;releaseUrl:string;publishedAt:Date|null;notesText:string;observedAt:Date; }
export interface ReleaseAdapter { fetchReleases(source:ReleaseSource):Promise<NormalizedRelease[]>; }

/** Static validation only. Fetchers must additionally resolve DNS and recheck every redirect. */
export function validatePublicUrl(value:string):void {
  const url=new URL(value); const host=url.hostname.toLowerCase();
  if(url.protocol!=='https:' || url.username || url.password || url.hash || (url.port && url.port!=='443')) throw new Error('Unsafe URL: HTTPS without credentials, fragments or custom ports required');
  // Reject literal IPs entirely, including IPv6 and unusual IPv4 representations normalized by URL.
  if(isIP(host)||host.startsWith('[')||!host.includes('.')||host.endsWith('.')||/(^|\.)(localhost|local|internal|invalid|test)$/.test(host)||host==='metadata.google.internal') throw new Error('Unsafe URL destination');
}
function inspectStrings(value:unknown):void {
  if(typeof value==='string' && /[\p{Cc}\p{Cf}<>]/u.test(value)) throw new Error('Control characters, invisible Unicode and HTML are forbidden');
  if(Array.isArray(value)) value.forEach(inspectStrings);
  else if(value && typeof value==='object') Object.values(value).forEach(inspectStrings);
}
// Keep this a module-relative filesystem URL. Webpack treats a literal new URL
// with import.meta.url as a browser asset request and cannot bundle a repository root.
const sourceModuleUrl=import.meta.url;
const root=resolve(fileURLToPath(new URL('../../../',sourceModuleUrl)));
const ajv=new Ajv2020({allErrors:true});
(addFormats as unknown as (ajv:Ajv2020)=>void)(ajv);
const validate=ajv.compile(JSON.parse(await readFile(resolve(root,'catalog/schema/service.schema.json'),'utf8')));
export function parseService(input:unknown):Service {
  if(!validate(input)) throw new Error(ajv.errorsText(validate.errors));
  const service=serviceSchema.parse(input); inspectStrings(service);
  validatePublicUrl(service.website); if(service.repository) validatePublicUrl(service.repository.url);
  for(const source of service.releaseSources) { if(source.kind==='rss') validatePublicUrl(source.url); if(source.kind==='gitlab-releases') validatePublicUrl(source.projectUrl); }
  const aliases=(service.aliases??[]).map(x=>x.trim().toLowerCase());
  if(new Set(aliases).size!==aliases.length) throw new Error('Duplicate normalized aliases');
  return service;
}
export async function loadRegistry(directory=resolve(root,'catalog/services')):Promise<CatalogRecord[]> {
  const records:CatalogRecord[]=[]; const slugs=new Set<string>();const repos=new Set<string>();
  for(const file of (await readdir(directory)).filter(x=>x.endsWith('.json')).sort()) {
    const raw=await readFile(resolve(directory,file)); if(raw.length>32768) throw new Error(`${file}: exceeds 32KiB`);
    const definition=parseService(JSON.parse(raw.toString('utf8')));
    if(basename(file,'.json')!==definition.slug||slugs.has(definition.slug)) throw new Error(`${file}: slug collision or filename mismatch`);
    slugs.add(definition.slug);
    if(definition.repository) {const repo=definition.repository.url.replace(/\/$/,'').replace(/\.git$/,'').toLowerCase();if(repos.has(repo)) throw new Error(`${file}: duplicate repository`);repos.add(repo);}
    records.push({definition,sourceHash:createHash('sha256').update(raw).digest('hex'),provenanceUrl:`catalog/services/${file}`,origin:'custom_json'});
  }
  return records;
}
export class StaticCatalogAdapter implements CatalogAdapter {constructor(private directory?:string){} fetchCatalog(){return loadRegistry(this.directory);} }
