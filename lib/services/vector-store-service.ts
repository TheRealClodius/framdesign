/**
 * Vector store service using Upstash Vector.
 *
 * Replaces the previous Qdrant Cloud implementation. Public API is preserved
 * so callers (kb-search/handler.js, kb-get/handler.js, kb-embed-service,
 * kb-audit, verify-kb-embedding, test-search) need no changes.
 *
 * Filter input remains the legacy shape:
 *   { entity_type: 'project' }                              -> equality
 *   { related_entities: { $contains: 'lab:fram_design' } }  -> array membership
 * Both are translated to Upstash's SQL-like metadata filter DSL.
 *
 * Index configuration (created via Vercel Marketplace):
 *   dimensions: 768, similarity: COSINE, embeddingModel: NA, region: dub1
 */

import { Index } from '@upstash/vector';

const VECTOR_SIZE = 768;

let indexClient: Index | null = null;

function getIndex(): Index {
  if (!indexClient) {
    const url = process.env.UPSTASH_VECTOR_REST_URL;
    const token = process.env.UPSTASH_VECTOR_REST_TOKEN;
    if (!url) {
      throw new Error(
        'UPSTASH_VECTOR_REST_URL environment variable is required.'
      );
    }
    if (!token) {
      throw new Error(
        'UPSTASH_VECTOR_REST_TOKEN environment variable is required.'
      );
    }
    indexClient = new Index({ url, token });
  }
  return indexClient;
}

/**
 * Escape a value for inclusion as a quoted string in Upstash's filter DSL.
 * Upstash filter strings use double quotes; embedded quotes/backslashes are
 * backslash-escaped.
 */
function escapeFilterValue(value: unknown): string {
  const str = String(value);
  return `"${str.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * Translate the legacy filter object into Upstash's metadata filter DSL.
 *
 *   { entity_id: 'project:foo' }
 *     -> entity_id = "project:foo"
 *
 *   { related_entities: { $contains: 'lab:fram_design' } }
 *     -> related_entities CONTAINS "lab:fram_design"
 *
 *   { entity_type: 'project', entity_id: 'project:foo' }
 *     -> entity_type = "project" AND entity_id = "project:foo"
 */
function buildUpstashFilter(filters?: Record<string, any>): string | undefined {
  if (!filters || Object.keys(filters).length === 0) return undefined;

  const clauses: string[] = [];
  for (const [key, value] of Object.entries(filters)) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'object' && '$contains' in value) {
      clauses.push(`${key} CONTAINS ${escapeFilterValue(value.$contains)}`);
    } else {
      clauses.push(`${key} = ${escapeFilterValue(value)}`);
    }
  }
  return clauses.length > 0 ? clauses.join(' AND ') : undefined;
}

/**
 * Build the metadata payload to send to Upstash.
 * - Excludes 'id' (would shadow Upstash's id field).
 * - Stores chunk text under 'text' so search results can return it
 *   without an extra fetch.
 */
function buildPayloadMetadata(
  text: string,
  metadata?: Record<string, any>
): Record<string, any> {
  const payload: Record<string, any> = { text: String(text) };
  if (!metadata) return payload;

  for (const [key, value] of Object.entries(metadata)) {
    if (key === 'id') continue;
    if (value === null || value === undefined) continue;
    payload[key] = value;
  }
  return payload;
}

function isNotFoundError(error: any): boolean {
  const msg = String(error?.message || '').toLowerCase();
  return (
    msg.includes("doesn't exist") ||
    msg.includes('not found') ||
    msg.includes('404')
  );
}

/**
 * Upsert documents into the vector store.
 * Idempotent: Upstash upsert overwrites by id.
 */
export async function upsertDocuments(
  documents: Array<{
    id: string;
    text: string;
    embedding: number[];
    metadata?: Record<string, any>;
  }>
): Promise<void> {
  if (documents.length === 0) {
    console.warn('[vector-store] No documents to upsert');
    return;
  }

  const index = getIndex();

  const points = documents.map((doc) => {
    if (doc.embedding.length !== VECTOR_SIZE) {
      throw new Error(
        `[vector-store] Embedding dimension mismatch for ${doc.id}: ` +
          `expected ${VECTOR_SIZE}, got ${doc.embedding.length}`
      );
    }
    return {
      id: doc.id,
      vector: doc.embedding,
      metadata: buildPayloadMetadata(doc.text, doc.metadata),
    };
  });

  // Upstash accepts batched upserts in a single call.
  await index.upsert(points);
  console.log(`[vector-store] Upserted ${points.length} documents`);
}

/**
 * Vector similarity search with optional metadata filtering.
 */
export async function searchSimilar(
  queryEmbedding: number[],
  topK: number = 5,
  filters?: Record<string, any>,
  _queryText?: string
): Promise<Array<{
  id: string;
  text: string;
  metadata: Record<string, any>;
  distance: number;
  score: number;
}>> {
  try {
    const index = getIndex();
    const filter = buildUpstashFilter(filters);

    const results = await index.query({
      vector: queryEmbedding,
      topK,
      includeMetadata: true,
      filter,
    });

    return results.map((r) => {
      const fullMetadata = (r.metadata as Record<string, any>) || {};
      const text = (fullMetadata.text as string) || '';
      // Strip 'text' from the metadata view we hand back, mirroring the
      // legacy behaviour where text was stored alongside metadata.
      const { text: _omit, ...metadata } = fullMetadata;
      const score = typeof r.score === 'number' ? r.score : 0;
      return {
        id: String(r.id),
        text,
        metadata,
        distance: 1 - score,
        score,
      };
    });
  } catch (error: any) {
    if (isNotFoundError(error)) return [];
    console.error('[vector-store] Error searching:', error);
    throw error;
  }
}

/**
 * Delete documents by their string IDs.
 */
export async function deleteDocuments(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    const index = getIndex();
    await index.delete(ids);
    console.log(`[vector-store] Deleted ${ids.length} documents`);
  } catch (error: any) {
    if (isNotFoundError(error)) return;
    console.error('[vector-store] Error deleting documents:', error);
    throw error;
  }
}

/**
 * Iterate every point in the index, paginating via Upstash's range cursor.
 * Internal helper shared by getAllDocumentIds, scrollByFilter, countByFilter.
 */
async function* iterateAll(
  withMetadata: boolean
): AsyncGenerator<{ id: string; metadata?: Record<string, any> }> {
  const index = getIndex();
  let cursor: string | number = 0;
  const PAGE = 1000;

  while (true) {
    const page: {
      nextCursor: string;
      vectors: Array<{ id: string | number; metadata?: Record<string, any> }>;
    } = await index.range({
      cursor,
      limit: PAGE,
      includeMetadata: withMetadata,
    });

    for (const v of page.vectors) {
      yield {
        id: String(v.id),
        metadata: withMetadata ? (v.metadata as Record<string, any>) : undefined,
      };
    }

    // Upstash returns nextCursor as '0' or '' when iteration is done.
    if (!page.nextCursor || page.nextCursor === '0') {
      return;
    }
    cursor = page.nextCursor;
  }
}

/**
 * Return all chunk IDs in the index.
 */
export async function getAllDocumentIds(): Promise<string[]> {
  try {
    const ids: string[] = [];
    for await (const point of iterateAll(false)) {
      ids.push(point.id);
    }
    return ids;
  } catch (error: any) {
    if (isNotFoundError(error)) return [];
    console.error('[vector-store] Error getting document IDs:', error);
    return [];
  }
}

/**
 * True iff the index has at least one vector.
 */
export async function hasDocuments(): Promise<boolean> {
  try {
    const index = getIndex();
    const info = await index.info();
    return (info.vectorCount || 0) > 0;
  } catch (error: any) {
    if (isNotFoundError(error)) return false;
    console.warn('[vector-store] Error checking documents:', error);
    return false;
  }
}

/**
 * Match a metadata payload against a legacy filter object.
 * Used for client-side filtering in scrollByFilter / countByFilter, since
 * Upstash's range() does not accept metadata filters.
 */
function matchesFilter(
  metadata: Record<string, any> | undefined,
  filters: Record<string, any>
): boolean {
  if (!metadata) return false;
  for (const [key, value] of Object.entries(filters)) {
    const actual = metadata[key];
    if (typeof value === 'object' && value !== null && '$contains' in value) {
      if (!Array.isArray(actual)) return false;
      if (!actual.includes(value.$contains)) return false;
    } else {
      if (actual !== value) return false;
    }
  }
  return true;
}

/**
 * Count points matching a filter. No vector search.
 *
 * Implementation note: Upstash's range() doesn't accept filters, so we
 * iterate all metadata and count client-side. At the project's current
 * scale (~1.5k chunks) this is one or two round trips.
 */
export async function countByFilter(
  filters: Record<string, any>
): Promise<number> {
  try {
    let count = 0;
    for await (const point of iterateAll(true)) {
      if (matchesFilter(point.metadata, filters)) count++;
    }
    return count;
  } catch (error: any) {
    if (isNotFoundError(error)) return 0;
    console.error('[vector-store] Error counting by filter:', error);
    throw error;
  }
}

/**
 * Scroll through all points matching a filter. Returns lightweight
 * per-entity metadata, deduplicated across chunks.
 */
export async function scrollByFilter(
  filters: Record<string, any>,
  _payloadFields?: string[]
): Promise<Array<{ id: string; type: string; title: string }>> {
  try {
    const seen = new Set<string>();
    const out: Array<{ id: string; type: string; title: string }> = [];
    for await (const point of iterateAll(true)) {
      if (!matchesFilter(point.metadata, filters)) continue;
      const md = point.metadata || {};
      const entityId = (md.entity_id as string) || point.id;
      if (seen.has(entityId)) continue;
      seen.add(entityId);
      out.push({
        id: entityId,
        type: (md.entity_type as string) || 'unknown',
        title: (md.title as string) || entityId,
      });
    }
    return out;
  } catch (error: any) {
    if (isNotFoundError(error)) return [];
    console.error('[vector-store] Error scrolling by filter:', error);
    throw error;
  }
}

/**
 * Return all chunks for a given entity_id without running a vector search.
 *
 * Upstash's range() can't filter, but query() can. We use a small
 * placeholder vector and rely on the entity_id filter to return every
 * matching chunk; scores are meaningless here and ignored.
 */
export async function getByEntityId(
  entityId: string
): Promise<Array<{
  id: string;
  text: string;
  metadata: Record<string, any>;
}>> {
  try {
    const index = getIndex();
    const placeholderVector = new Array(VECTOR_SIZE).fill(0.001);
    const filter = buildUpstashFilter({ entity_id: entityId });

    const results = await index.query({
      vector: placeholderVector,
      topK: 100,
      includeMetadata: true,
      filter,
    });

    return results.map((r) => {
      const fullMetadata = (r.metadata as Record<string, any>) || {};
      const text = (fullMetadata.text as string) || '';
      const { text: _omit, ...metadata } = fullMetadata;
      return {
        id: String(r.id),
        text,
        metadata,
      };
    });
  } catch (error: any) {
    if (isNotFoundError(error)) return [];
    console.error('[vector-store] Error in getByEntityId:', error);
    throw error;
  }
}
