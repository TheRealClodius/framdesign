/**
 * Vector store service using Qdrant Cloud
 * Manages KB document embeddings and similarity search
 * 
 * Uses Qdrant Cloud HTTP API - works in all environments (local, Vercel, Railway)
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import { createHash } from 'crypto';

/**
 * Convert string ID to integer for Qdrant
 * Qdrant requires point IDs to be unsigned integers or UUIDs
 * We use a hash function to deterministically convert string IDs to integers
 */
function stringIdToInteger(id: string): number {
  // Use SHA-256 hash and take first 8 bytes as a 64-bit unsigned integer
  // This ensures deterministic conversion while avoiding collisions
  const hash = createHash('sha256').update(id).digest();
  // Read first 8 bytes as BigInt, then convert to Number
  // Use bitwise AND with 0x7FFFFFFF to ensure positive 32-bit integer
  const hashInt = hash.readBigUInt64BE(0);
  // Convert to 32-bit unsigned integer (Qdrant accepts up to 64-bit, but JS Number is safe for 32-bit)
  return Number(hashInt & BigInt(0xFFFFFFFF));
}

// Qdrant configuration
const QDRANT_CLUSTER_ENDPOINT = process.env.QDRANT_CLUSTER_ENDPOINT;
const QDRANT_API_KEY = process.env.QDRANT_API_KEY;
const COLLECTION_NAME = 'kb_documents';
const VECTOR_SIZE = 768; // gemini-embedding-001 with outputDimensionality=768

// Lazy-loaded Qdrant client
let qdrantClient: QdrantClient | null = null;

/**
 * Get or create Qdrant client
 */
function getQdrantClient(): QdrantClient {
  if (!qdrantClient) {
    if (!QDRANT_CLUSTER_ENDPOINT) {
      throw new Error(
        'QDRANT_CLUSTER_ENDPOINT environment variable is required. ' +
        'Set it to your Qdrant Cloud cluster URL.'
      );
    }

    if (!QDRANT_API_KEY) {
      throw new Error(
        'QDRANT_API_KEY environment variable is required. ' +
        'Set it to your Qdrant Cloud API key.'
      );
    }

    qdrantClient = new QdrantClient({
      url: QDRANT_CLUSTER_ENDPOINT,
      apiKey: QDRANT_API_KEY,
    });
  }

  return qdrantClient;
}

/**
 * Ensure collection exists with proper configuration
 */
async function ensureCollection(): Promise<void> {
  const client = getQdrantClient();

  try {
    // Check if collection exists
    const collections = await client.getCollections();
    const exists = collections.collections.some(
      (col) => col.name === COLLECTION_NAME
    );

    if (!exists) {
      // Create collection with proper configuration
      await client.createCollection(COLLECTION_NAME, {
        vectors: {
          size: VECTOR_SIZE,
          distance: 'Cosine',
        },
      });

      console.log(`[vector-store] Created collection ${COLLECTION_NAME}`);

      // Create payload indexes for efficient filtering
      try {
        await client.createPayloadIndex(COLLECTION_NAME, {
          field_name: 'entity_id',
          field_schema: 'keyword',
        });
        await client.createPayloadIndex(COLLECTION_NAME, {
          field_name: 'entity_type',
          field_schema: 'keyword',
        });
        await client.createPayloadIndex(COLLECTION_NAME, {
          field_name: 'file_path',
          field_schema: 'keyword',
        });
        console.log('[vector-store] Created payload indexes (entity_id, entity_type, file_path)');
      } catch (indexError: any) {
        // Indexes might already exist or creation might fail - log but don't fail
        console.warn('[vector-store] Warning creating indexes:', indexError.message);
      }
    }
  } catch (error: any) {
    // If collection already exists, that's fine
    if (!error.message?.includes('already exists')) {
      throw error;
    }
  }
}

/**
 * Upsert documents into vector store
 * 
 * Idempotent: Qdrant's upsert() updates existing points by ID, so re-running
 * the embedding script is safe and won't create duplicates.
 * 
 * Important: The 'id' field in metadata is excluded to prevent overwriting
 * the document ID. Frontmatter 'id' should be stored as 'entity_id' instead.
 * 
 * @param documents - Array of document objects with id, text, embedding, metadata
 *   - id: Unique chunk ID (format: {entity_id}_chunk_{index})
 *   - text: Chunk text content
 *   - embedding: Vector embedding (768 dimensions for gemini-embedding-001)
 *   - metadata: Object with file_path, chunk_index, entity_id, etc.
 *     NOTE: Must not contain 'id' field (would overwrite document ID)
 */
export async function upsertDocuments(
  documents: Array<{
    id: string;
    text: string;
    embedding: number[];
    metadata?: Record<string, any>;
  }>
): Promise<void> {
  try {
    if (documents.length === 0) {
      console.warn('[vector-store] No documents to upsert');
      return;
    }

    const client = getQdrantClient();

    // Ensure collection exists
    await ensureCollection();

    // Prepare points for Qdrant
    const points = documents.map((doc) => {
      // Build payload from metadata, excluding 'id' field
      const payload: Record<string, any> = {
        text: String(doc.text),
      };

      if (doc.metadata) {
        for (const [key, value] of Object.entries(doc.metadata)) {
          // Skip 'id' field - it would overwrite the document ID
          if (key === 'id') continue;
          // Skip if value is null or undefined
          if (value === null || value === undefined) continue;

          // Qdrant payload supports: string, number, boolean, arrays, objects
          if (
            typeof value === 'string' ||
            typeof value === 'number' ||
            typeof value === 'boolean'
          ) {
            payload[key] = value;
          } else if (Array.isArray(value)) {
            payload[key] = value;
          } else if (typeof value === 'object') {
            // Convert objects to JSON strings for consistency
            payload[key] = JSON.stringify(value);
          }
        }
      }

      // Convert string ID to integer for Qdrant
      // Store original string ID in payload for retrieval
      const pointId = stringIdToInteger(doc.id);
      payload.original_id = doc.id; // Store original string ID in payload

      return {
        id: pointId, // Point ID: integer hash of {entity_id}_chunk_{index}
        vector: doc.embedding, // 768-dimensional vector
        payload: payload,
      };
    });

    // Upsert points (idempotent operation)
    await client.upsert(COLLECTION_NAME, {
      wait: true,
      points: points,
    });

    console.log(`[vector-store] Upserted ${documents.length} documents`);
  } catch (error) {
    console.error('[vector-store] Error upserting documents:', error);
    throw error;
  }
}

/**
 * Search for similar documents
 * @param queryEmbedding - Query embedding vector (768 dimensions)
 * @param topK - Number of results to return
 * @param filters - Optional metadata filters (e.g., { entity_id: "lab:fram_design" })
 * @param queryText - Query text (not used, kept for API compatibility)
 * @returns Array of search results with id, text, metadata, distance, score
 */
export async function searchSimilar(
  queryEmbedding: number[],
  topK: number = 5,
  filters?: Record<string, any>,
  queryText?: string
): Promise<Array<{
  id: string;
  text: string;
  metadata: Record<string, any>;
  distance: number;
  score: number;
}>> {
  try {
    const client = getQdrantClient();

    // Build filter if provided
    let queryFilter: any = undefined;
    if (filters && Object.keys(filters).length > 0) {
      const mustConditions = Object.entries(filters).map(([key, value]) => ({
        key: key,
        match: { value: value },
      }));

      queryFilter = {
        must: mustConditions,
      };
    }

    // Perform vector search
    const results = await client.search(COLLECTION_NAME, {
      vector: queryEmbedding,
      limit: topK,
      filter: queryFilter,
      with_payload: true,
    });

    // Transform results to match expected format
    return results.map((result) => {
      // Extract text from payload
      const text = (result.payload?.text as string) || '';

      // Extract metadata (all payload fields except 'text' and 'original_id')
      const metadata: Record<string, any> = {};
      if (result.payload) {
        for (const [key, value] of Object.entries(result.payload)) {
          if (key !== 'text' && key !== 'original_id') {
            metadata[key] = value;
          }
        }
      }

      // Use original_id from payload if available, otherwise convert integer ID to string
      const documentId = (result.payload?.original_id as string) || String(result.id);

      // Qdrant returns score (similarity), convert to distance
      // Cosine similarity: 1 = identical, 0 = orthogonal, -1 = opposite
      // Distance: 0 = identical, 1 = orthogonal, 2 = opposite
      const score = result.score || 0;
      const distance = 1 - score; // Cosine distance

      return {
        id: documentId, // Return original string ID
        text: text,
        metadata: metadata,
        distance: distance,
        score: score,
      };
    });
  } catch (error: any) {
    // If collection doesn't exist, return empty results
    if (error.message?.includes('doesn\'t exist') || error.message?.includes('not found')) {
      return [];
    }
    // Log detailed error information from Qdrant
    console.error('[vector-store] Error searching:', error);
    if (error.data) {
      console.error('[vector-store] Qdrant error details:', JSON.stringify(error.data, null, 2));
    }
    throw error;
  }
}

/**
 * Delete documents by IDs
 * @param ids - Array of document string IDs to delete
 */
export async function deleteDocuments(ids: string[]): Promise<void> {
  try {
    if (ids.length === 0) {
      return;
    }

    const client = getQdrantClient();

    // Convert string IDs to integers for Qdrant
    const pointIds = ids.map(stringIdToInteger);

    // Delete points by IDs
    await client.delete(COLLECTION_NAME, {
      wait: true,
      points: pointIds,
    });

    console.log(`[vector-store] Deleted ${ids.length} documents`);
  } catch (error: any) {
    // If collection doesn't exist, nothing to delete
    if (error.message?.includes('doesn\'t exist') || error.message?.includes('not found')) {
      return;
    }
    console.error('[vector-store] Error deleting documents:', error);
    throw error;
  }
}

/**
 * Get all document IDs in the collection
 */
export async function getAllDocumentIds(): Promise<string[]> {
  try {
    const client = getQdrantClient();

    // Scroll through all points to get IDs
    const allIds: string[] = [];
    let offset: string | number | Record<string, unknown> | undefined = undefined;

    while (true) {
      // Scroll with payload to get original_id
      const result = await client.scroll(COLLECTION_NAME, {
        limit: 100,
        offset: offset,
        with_payload: true,
        with_vector: false,
      });
      
      // Add IDs from this batch
      for (const point of result.points) {
        // Use original_id from payload if available, otherwise convert integer ID to string
        const documentId = (point.payload?.original_id as string) || String(point.id);
        allIds.push(documentId);
      }
      
      // Check if there are more points
      if (!result.next_page_offset) {
        break;
      }
      offset = result.next_page_offset;
    }

    return allIds;
  } catch (error: any) {
    // If collection doesn't exist, return empty array
    if (error.message?.includes('doesn\'t exist') || error.message?.includes('not found')) {
      return [];
    }
    console.error('[vector-store] Error getting document IDs:', error);
    return [];
  }
}

/**
 * Check if collection exists and has documents
 */
export async function hasDocuments(): Promise<boolean> {
  try {
    const client = getQdrantClient();

    // Get collection info
    const collectionInfo = await client.getCollection(COLLECTION_NAME);

    // Check if collection has points
    return (collectionInfo.points_count || 0) > 0;
  } catch (error: any) {
    // If collection doesn't exist, return false
    if (error.message?.includes('doesn\'t exist') || error.message?.includes('not found')) {
      return false;
    }
    console.warn('[vector-store] Error checking documents:', error);
    return false;
  }
}
