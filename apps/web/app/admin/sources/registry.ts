import {loadRegistry} from '@labticker/catalog';
import {resolve} from 'node:path';
import type {RegistrySourceMap} from '@labticker/database/source-admin';
export async function currentSourceRegistry():Promise<RegistrySourceMap>{
 const registry=await loadRegistry(resolve(process.cwd(),'../../catalog/services'));
 return new Map(registry.map(record=>[record.definition.slug,new Set(record.definition.releaseSources.flatMap(source=>source.kind==='github-releases'?[source.repository.toLowerCase()]:[]))]));
}
