import { and, eq } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema.js';

export interface CatalogUpsert {
  /** Immutable record identity. Retain on display-name/slug corrections. */
  externalId: string;
  provider: 'custom_json' | 'selfhst' | 'manual';
  sourceHash: string;
  gitCommit: string;
  provenanceUrl: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  homepageUrl: string;
  repoUrl?: string;
  aliases?: string[];
}
/** Caller validates catalog data at the ingestion boundary. Never matches display names,
 * deletes absent records, or changes application IDs. Identity collisions require review.
 * selfh.st remains disabled at the adapter boundary pending permission verification.
 */
export async function upsertCatalogEntry(db: PgDatabase<PgQueryResultHKT, typeof schema>, input: CatalogUpsert, observedAt = new Date()): Promise<string> {
  for (const value of [input.externalId,input.sourceHash,input.gitCommit,input.provenanceUrl,input.slug,input.name,input.description,input.category,input.homepageUrl]) {
    if (!value.trim()) throw new Error('Catalog metadata cannot be blank');
  }
  return db.transaction(async tx => {
    const [source] = await tx.select().from(schema.appSourceRecords).where(and(eq(schema.appSourceRecords.provider,input.provider),eq(schema.appSourceRecords.externalId,input.externalId)));
    const [bySlug] = await tx.select().from(schema.applications).where(eq(schema.applications.slug,input.slug));
    const [slugAlias] = await tx.select().from(schema.appAliases).where(eq(schema.appAliases.alias,input.slug));
    if (slugAlias && slugAlias.applicationId !== source?.applicationId) throw new Error('Slug belongs to an existing alias; review required');
    if (source && bySlug && source.applicationId !== bySlug.id) throw new Error('Catalog identity collision requires review');
    // Linking a different provider requires explicit review rather than name/slug auto-merging.
    if (!source && bySlug) throw new Error('Existing slug requires a reviewed identity mapping');
    const [previous] = source ? await tx.select().from(schema.applications).where(eq(schema.applications.id,source.applicationId)) : [];
    if (source && !previous) throw new Error('Catalog source has no application');
    const metadata = {slug:input.slug,name:input.name,description:input.description,category:input.category,homepageUrl:input.homepageUrl,...(input.repoUrl?.trim() ? {repoUrl:input.repoUrl}:{}),updatedAt:observedAt};
    const [app] = previous
      ? await tx.update(schema.applications).set(metadata).where(eq(schema.applications.id,previous.id)).returning()
      : await tx.insert(schema.applications).values(metadata).returning();
    if (!app) throw new Error('Catalog upsert returned no application');
    const aliases = [...(input.aliases ?? []), ...(previous && previous.slug !== app.slug ? [previous.slug] : [])];
    for (const alias of aliases) {
      const normalized = alias.trim().toLowerCase();
      if (!normalized) throw new Error('Catalog alias cannot be blank');
      const [canonical] = await tx.select().from(schema.applications).where(eq(schema.applications.slug,normalized));
      if(canonical && canonical.id!==app.id) throw new Error('Alias conflicts with canonical slug');
      const [existing] = await tx.select().from(schema.appAliases).where(eq(schema.appAliases.alias,normalized));
      if(existing && existing.applicationId!==app.id) throw new Error('Alias collision requires review');
      await tx.insert(schema.appAliases).values({alias:normalized,applicationId:app.id}).onConflictDoNothing();
    }
    if (source) await tx.update(schema.appSourceRecords).set({sourceHash:input.sourceHash,gitCommit:input.gitCommit,provenanceUrl:input.provenanceUrl,lastSeenAt:observedAt}).where(eq(schema.appSourceRecords.id,source.id));
    else await tx.insert(schema.appSourceRecords).values({applicationId:app.id,provider:input.provider,externalId:input.externalId,sourceHash:input.sourceHash,gitCommit:input.gitCommit,provenanceUrl:input.provenanceUrl,lastSeenAt:observedAt});
    if (!source || source.sourceHash!==input.sourceHash) await tx.insert(schema.catalogChanges).values({applicationId:app.id,sourceHash:input.sourceHash,gitCommit:input.gitCommit,previous:previous??null,current:app});
    return app.id;
  });
}
