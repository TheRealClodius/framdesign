/**
 * Vector store service using LanceDB (local file-based) or API
 * Manages KB document embeddings and similarity search
 * 
 * Supports two modes:
 * 1. Local mode: Direct LanceDB access (when VECTOR_SEARCH_API_URL not set)
 *    - Requires @lancedb/lancedb package (installed as optionalDependency)
 *    - NOT available in serverless environments (Vercel)
 * 2. API mode: HTTP API calls to vector-search-api service (when VECTOR_SEARCH_API_URL is set)
 *    - Required for Vercel (serverless, no persistent storage)
 *    - Does NOT require LanceDB to be installed
 */

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Local LanceDB path (stores data in project directory)
const LANCE_DB_PATH = path.join(__dirname, '../../.lancedb');
const TABLE_NAME = 'kb_documents';
const VECTOR_SEARCH_API_URL = process.env.VECTOR_SEARCH_API_URL;

// Check if we're in API mode (required for serverless/Vercel)
const IS_API_MODE = !!VECTOR_SEARCH_API_URL;

// Lazy-loaded LanceDB module (dynamic import to avoid bundling issues)
// Only loaded when LOCAL mode is used (not API mode)
let lancedbModule: any = null;
let db: any = null;
let table: any = null;

/**
 * Dynamically import LanceDB (only when needed for local mode)
 * This prevents Next.js from trying to bundle native modules during module evaluation
 * 
 * IMPORTANT: This function should ONLY be called when NOT in API mode.
 * In API mode (serverless), LanceDB is not installed and this will fail.
 */
async function getLanceDB() {
  // Prevent LanceDB usage in API mode (serverless environments)
  if (IS_API_MODE) {
    throw new Error(
      'LanceDB is not available in API mode (serverless). ' +
      'VECTOR_SEARCH_API_URL is set, use the API endpoints instead.'
    );
  }
  
  if (!lancedbModule) {
    try {
      // Dynamic import using eval to completely prevent Webpack static analysis
      // This ensures Webpack doesn't try to bundle LanceDB when in API mode
      // The eval prevents webpack from analyzing the import at build time
      const importFunc = new Function('moduleName', 'return import(moduleName)');
      lancedbModule = await importFunc('@lancedb/lancedb');
    } catch (error: any) {
      throw new Error(
        `Failed to load LanceDB. This is expected in serverless environments. ` +
        `For Vercel deployment, set VECTOR_SEARCH_API_URL to use the API mode. ` +
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
 *
 * Drops and recreates the table on each call to ensure clean schema.
 * This prevents schema conflicts when metadata structure changes.
 *
 * Important: The 'id' field in metadata is excluded to prevent overwriting
 * the document ID. Frontmatter 'id' should be stored as 'entity_id' instead.
 *
 * @param documents - Array of document objects with id, text, embedding, metadata
 *   - id: Unique chunk ID (format: {entity_id}_chunk_{index})
 *   - text: Chunk text content
 *   - embedding: Vector embedding (768 dimensions for text-embedding-004)
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
  if (IS_API_MODE) {
    throw new Error('[vector-store] upsertDocuments is not available in API mode. Use the vector-search-api service directly.');
  }

  try {
    const database = await getDB();
    
    if (documents.length === 0) {
      console.warn('[vector-store] No documents to upsert');
      return;
    }

    // Prepare data for LanceDB (array of objects)
    // Ensure all metadata values are primitives (string, number, boolean)
    const data = documents.map(doc => {
      const row: any = {
        id: String(doc.id), // Ensure ID is a string
        vector: doc.embedding,
        text: String(doc.text),
      };
      
      // Add metadata fields, ensuring all values are primitives
      // 
      // ⚠️ CRITICAL: Skip 'id' field in metadata to prevent overwriting document ID
      // The document ID (e.g., "lab:fram_design_chunk_0") is set above (line 112)
      // If metadata contains an 'id' field, it would overwrite this unique chunk ID
      // This causes all chunks from the same file to have duplicate IDs
      // Frontmatter 'id' is stored as 'entity_id' in metadata (see embed-kb.ts line 155)
      // See embed-kb.ts line 162 for the corresponding exclusion when building metadata
      if (doc.metadata) {
        for (const [key, value] of Object.entries(doc.metadata)) {
          // Skip 'id' field - it would overwrite the document ID
          if (key === 'id') continue;
          // Skip if value is null or undefined
          if (value === null || value === undefined) continue;
          
          // Ensure value is a primitive type
          if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            row[key] = value;
          } else {
            // Convert objects/arrays to JSON strings
            row[key] = JSON.stringify(value);
          }
        }
      }
      
      return row;
    });

    // Check if table exists
    let currentTable: any = null;
    try {
      currentTable = await database.openTable(TABLE_NAME);
    } catch {
      // Table doesn't exist, create it
    }

    if (currentTable) {
      // Table exists - drop and recreate to avoid schema conflicts
      // 
      // ⚠️ NOTE: We drop and recreate instead of using mergeInsert to ensure:
      // 1. Clean schema matching current metadata structure
      // 2. No conflicts from schema changes
      // 3. Consistent data structure
      // If you need to preserve existing data, modify to use mergeInsert instead
      try {
        await database.dropTable(TABLE_NAME);
        console.log(`[vector-store] Dropped existing table ${TABLE_NAME} for schema refresh`);
      } catch (error: any) {
        // Ignore errors if table doesn't exist
        if (!error.message?.includes('not found')) {
          console.warn(`[vector-store] Warning dropping table:`, error.message);
        }
      }
    }
    
    // Create new table with fresh schema
    table = await database.createTable(TABLE_NAME, data);

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
  // Use API mode if configured (required for Vercel/serverless)
  if (IS_API_MODE) {
    if (!queryText) {
      throw new Error('[vector-store] API mode requires queryText parameter');
    }
    
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

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`[vector-store] API search failed: ${response.status} ${errorText}`);
    }
    
    const data = await response.json();
    if (!data.ok || !data.data?.results) {
      throw new Error(`[vector-store] API returned invalid response: ${JSON.stringify(data)}`);
    }
    
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
  if (IS_API_MODE) {
    throw new Error('[vector-store] deleteDocuments is not available in API mode. Use the vector-search-api service directly.');
  }

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
    const allData = await currentTable.query().toArray();
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
  if (IS_API_MODE) {
    throw new Error('[vector-store] getAllDocumentIds is not available in API mode. Use the vector-search-api service directly.');
  }

  try {
    const database = await getDB();
    
    let currentTable: any;
    try {
      currentTable = await database.openTable(TABLE_NAME);
    } catch {
      return [];
    }

    const allData = await currentTable.query().toArray();
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
  // API mode (required for serverless/Vercel)
  if (IS_API_MODE) {
    try {
      const response = await fetch(`${VECTOR_SEARCH_API_URL}/status`);
      if (response.ok) {
        const data = await response.json();
        return data.initialized && data.document_count > 0;
      }
      return false;
    } catch (error) {
      console.warn('[vector-store] API status check failed:', error);
      return false;
    }
  }

  // Local mode check (not available in serverless)
  try {
    const ids = await getAllDocumentIds();
    return ids.length > 0;
  } catch (error) {
    return false;
  }
}
