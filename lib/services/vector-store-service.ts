/**
 * Vector store service using LanceDB (local file-based) or API
 * Manages KB document embeddings and similarity search
 * 
 * Supports two modes:
 * 1. Local mode: Direct LanceDB access (when VECTOR_SEARCH_API_URL not set)
 * 2. API mode: HTTP API calls to vector-search-api service (when VECTOR_SEARCH_API_URL is set)
 *    - Required for Vercel (serverless, no persistent storage)
 */

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Local LanceDB path (stores data in project directory)
const LANCE_DB_PATH = path.join(__dirname, '../../.lancedb');
const TABLE_NAME = 'kb_documents';
const VECTOR_SEARCH_API_URL = process.env.VECTOR_SEARCH_API_URL;

// Lazy-loaded LanceDB module (dynamic import to avoid bundling issues)
let lancedbModule: typeof import('@lancedb/lancedb') | null = null;
let db: any = null;
let table: any = null;

/**
 * Dynamically import LanceDB (only when needed for local mode)
 * This prevents Next.js from trying to bundle native modules during module evaluation
 */
async function getLanceDB() {
  if (!lancedbModule) {
    try {
      // Dynamic import to avoid bundling issues with native modules
      lancedbModule = await import('@lancedb/lancedb');
    } catch (error: any) {
      throw new Error(
        `Failed to load LanceDB. Make sure @lancedb/lancedb is installed and you're running in a Node.js environment. ` +
        `Original error: ${error.message}`
      );
    }
  }
  return lancedbModule;
}

/**
 * Get or create LanceDB connection
 */
async function getDB() {
  if (!db) {
    const lancedb = await getLanceDB();
    db = await lancedb.connect(LANCE_DB_PATH);
  }
  return db;
}

/**
 * Get or create the KB table
 */
async function getTable() {
  if (!table) {
    const database = await getDB();
    
    try {
      // Try to open existing table
      table = await database.openTable(TABLE_NAME);
    } catch (error: any) {
      // Table doesn't exist, will be created on first insert
      // Return null for now, will create on upsert
      table = null;
    }
  }
  return table!;
}

/**
 * Upsert documents into vector store
 * @param documents - Array of document objects with id, text, embedding, metadata
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
    const database = await getDB();
    
    if (documents.length === 0) {
      console.warn('[vector-store] No documents to upsert');
      return;
    }

    // Prepare data for LanceDB (array of objects)
    const data = documents.map(doc => ({
      id: doc.id,
      vector: doc.embedding,
      text: doc.text,
      ...doc.metadata,
    }));

    // Check if table exists
    let currentTable: any = null;
    try {
      currentTable = await database.openTable(TABLE_NAME);
    } catch {
      // Table doesn't exist, create it
    }

    if (currentTable) {
      // Table exists, merge (upsert) data
      await currentTable.mergeInsert(data);
    } else {
      // Create new table
      table = await database.createTable(TABLE_NAME, data);
    }

    console.log(`[vector-store] Upserted ${documents.length} documents`);
  } catch (error) {
    console.error('[vector-store] Error upserting documents:', error);
    throw error;
  }
}

/**
 * Search for similar documents
 * @param queryEmbedding - Query embedding vector (not used in API mode)
 * @param topK - Number of results to return
 * @param filters - Optional metadata filters
 * @param queryText - Query text (required for API mode)
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
  // Use API mode if configured (required for Vercel)
  if (VECTOR_SEARCH_API_URL && queryText) {
    try {
      const response = await fetch(`${VECTOR_SEARCH_API_URL}/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: queryText,
          top_k: topK,
          filters: filters || {},
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.ok && data.data.results) {
          // API returns grouped documents, convert to chunk format
          return data.data.results.flatMap((doc: any) => 
            doc.chunks.map((chunk: any, idx: number) => ({
              id: `${doc.id}_chunk_${idx}`,
              text: chunk.text,
              metadata: doc.metadata,
              distance: 1 - chunk.score,
              score: chunk.score,
            }))
          );
        }
      }
    } catch (apiError) {
      console.warn('[vector-store] API search failed, falling back to local:', apiError);
      // Fall through to local mode
    }
  }

  // Local mode: Direct LanceDB access
  try {
    const database = await getDB();
    
    let currentTable: any;
    try {
      currentTable = await database.openTable(TABLE_NAME);
    } catch (error) {
      // Table doesn't exist
      return [];
    }

    // Perform vector search
    const results = await currentTable
      .vectorSearch(queryEmbedding)
      .limit(topK)
      .toArray();

    // Transform results to match expected format
    return results.map((result: any) => {
      // Extract metadata (all fields except id, vector, text)
      const { id, vector, text, ...metadata } = result;
      
      // Calculate score from distance (LanceDB returns distance, we want similarity)
      // Distance is typically cosine distance (0 = identical, 2 = opposite)
      // Convert to similarity score (1 = identical, 0 = opposite)
      const distance = result._distance || 0;
      const score = Math.max(0, 1 - distance / 2); // Normalize to 0-1 range

      return {
        id: String(id),
        text: String(text || ''),
        metadata: metadata || {},
        distance,
        score,
      };
    });
  } catch (error) {
    console.error('[vector-store] Error searching:', error);
    throw error;
  }
}

/**
 * Delete documents by IDs
 * @param ids - Array of document IDs to delete
 */
export async function deleteDocuments(ids: string[]): Promise<void> {
  try {
    const database = await getDB();
    
    let currentTable: any;
    try {
      currentTable = await database.openTable(TABLE_NAME);
    } catch {
      // Table doesn't exist, nothing to delete
      return;
    }

    // Delete by filtering out IDs
    // Note: LanceDB doesn't have direct delete by ID, so we need to filter
    const allData = await currentTable.toArray();
    const filteredData = allData.filter((row: any) => !ids.includes(String(row.id)));
    
    if (filteredData.length < allData.length) {
      // Recreate table with filtered data
      await database.dropTable(TABLE_NAME);
      if (filteredData.length > 0) {
        table = await database.createTable(TABLE_NAME, filteredData);
      }
    }

    console.log(`[vector-store] Deleted ${ids.length} documents`);
  } catch (error) {
    console.error('[vector-store] Error deleting documents:', error);
    throw error;
  }
}

/**
 * Get all document IDs in the table
 */
export async function getAllDocumentIds(): Promise<string[]> {
  try {
    const database = await getDB();
    
    let currentTable: any;
    try {
      currentTable = await database.openTable(TABLE_NAME);
    } catch {
      return [];
    }

    const allData = await currentTable.toArray();
    return allData.map((row: any) => String(row.id));
  } catch (error) {
    console.error('[vector-store] Error getting document IDs:', error);
    return [];
  }
}

/**
 * Check if table exists and has documents
 */
export async function hasDocuments(): Promise<boolean> {
  // Check API first if configured
  if (VECTOR_SEARCH_API_URL) {
    try {
      const response = await fetch(`${VECTOR_SEARCH_API_URL}/status`);
      if (response.ok) {
        const data = await response.json();
        return data.initialized && data.document_count > 0;
      }
    } catch (error) {
      // Fallback to local check
    }
  }

  // Local mode check
  try {
    const ids = await getAllDocumentIds();
    return ids.length > 0;
  } catch (error) {
    return false;
  }
}
