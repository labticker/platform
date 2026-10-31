import {eq, and, inArray} from 'drizzle-orm';
import type {PgDatabase,PgQueryResultHKT} from 'drizzle-orm/pg-core';
import * as schema from '@labticker/database/schema';
import {upsertCatalogEntry} from '@labticker/database';
import type {CatalogRecord} from '@labticker/catalog';
type Database = PgDatabase<PgQueryResultHKT,typeof schema>;

/** Reviewed Git registry only; missing files never delete application/subscriber history. */
export async function syncRegistry(db:Database, records:readonly CatalogRecord[], gitCommit:string, now=new Date()):Promise<number>{
 if(!/^[a-f0-9]{7,64}$/.test(gitCommit)) throw new Error('Catalog revision must be a Git SHA');
 // Override identity mapping must be explicitly reviewed before the optional importer exists.
 if(records.some(r=>r.definition.catalog.mode!=='add')) throw new Error('External overrides require reviewed identity mappings');
 return db.transaction(async tx=>{
  for(const record of records){
   const d=record.definition;
   const candidates=await tx.select().from(schema.appSourceRecords).where(and(eq(schema.appSourceRecords.provider,'custom_json'),inArray(schema.appSourceRecords.externalId,[d.slug,...(d.aliases??[]).map(a=>a.trim().toLowerCase())])));
   if(new Set(candidates.map(c=>c.applicationId)).size>1) throw new Error('Catalog aliases resolve conflicting identities');
   const identity=candidates[0];
   const appId=await upsertCatalogEntry(tx,{externalId:identity?.externalId??d.slug,provider:'custom_json',sourceHash:record.sourceHash,gitCommit,provenanceUrl:record.provenanceUrl,slug:d.slug,name:d.name,description:d.summary,category:d.category,homepageUrl:d.website,repoUrl:d.repository?.url,aliases:d.aliases},now);
   const previousSources=await tx.select().from(schema.releaseSources).where(eq(schema.releaseSources.applicationId,appId));
   const currentKeys=new Set(d.releaseSources.filter(s=>s.kind==='github-releases').map(s=>s.repository.toLowerCase()));
   // Disable removed definitions, while preserving operator pauses on retained mappings.
   for(const previous of previousSources) if(previous.provider==='github-releases'&&!currentKeys.has(previous.externalKey)) await tx.update(schema.releaseSources).set({enabled:false}).where(eq(schema.releaseSources.id,previous.id));
   for(const source of d.releaseSources){
    if(source.kind!=='github-releases') continue; // unsupported channels are never silently activated
    const externalKey=source.repository.toLowerCase();
    const mappings=await tx.select().from(schema.releaseSources).where(and(eq(schema.releaseSources.provider,'github-releases'),eq(schema.releaseSources.externalKey,externalKey)));
    if(mappings.some(mapping=>mapping.applicationId!==appId)) throw new Error('Repository already mapped; add reviewed prior slug alias for rename');
    const values={applicationId:appId,provider:'github-releases',externalKey,url:`https://api.github.com/repos/${externalKey}/releases`,enabled:true};
    await tx.insert(schema.releaseSources).values(values).onConflictDoUpdate({target:[schema.releaseSources.applicationId,schema.releaseSources.provider,schema.releaseSources.externalKey],set:{url:values.url}});
   }
   await tx.update(schema.applications).set({status:d.releaseSources.some(s=>s.kind==='github-releases')?'active':'no-supported-source'}).where(and(eq(schema.applications.id,appId),eq(schema.applications.isActive,true)));
  }
  return records.length;
 });
}
