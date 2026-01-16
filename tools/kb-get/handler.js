/**
 * kb_get Tool Handler
 *
 * Direct ID-based retrieval of KB documents
 * Uses a workaround: searches with large top_k and filters by entity_id
 */

import { ErrorType, ToolError } from '../_core/error-types.js';

/**
 * Execute kb_get tool
 *
 * @param {object} context - Execution context
 * @returns {Promise<ToolResponse>} - Result envelope
 */
export async function execute(context) {
  const { args } = context;
  const startTime = Date.now();
  const entityId = args.id;

  console.log(`[kb_get] Retrieving entity: ${entityId}`);

  try {
    // Workaround: Use searchSimilar with a dummy query to get all documents,
    // then filter by entity_id. Not efficient but works for small KBs.
    // Use path alias for Next.js compatibility, fallback to relative for Node.js
    let generateQueryEmbedding, searchSimilar;
    
    try {
      // Try Next.js path alias first (works in Next.js webpack)
      // Use string literals to help webpack static analysis
      const embeddingModule = await import('@/lib/services/embedding-service');
      const vectorModule = await import('@/lib/services/vector-store-service');
      generateQueryEmbedding = embeddingModule.generateQueryEmbedding
        || embeddingModule.default?.generateQueryEmbedding;
      searchSimilar = vectorModule.searchSimilar
        || vectorModule.default?.searchSimilar;
    } catch (importError) {
      // Fallback for Node.js runtime (voice server)
      // Use dynamic import with template literal to avoid webpack static analysis warnings
      // Webpack will see this as a dynamic expression and won't try to bundle it
      try {
        // Use a function to create the import path dynamically
        const getImportPath = (base) => `../../lib/services/${base}`;
        const embeddingPath = getImportPath('embedding-service');
        const vectorPath = getImportPath('vector-store-service');
        
        // Use Promise.all to load both modules in parallel
        const [embeddingModule, vectorModule] = await Promise.all([
          import(/* webpackIgnore: true */ embeddingPath),
          import(/* webpackIgnore: true */ vectorPath)
        ]);
        
        generateQueryEmbedding = embeddingModule.generateQueryEmbedding
          || embeddingModule.default?.generateQueryEmbedding;
        searchSimilar = vectorModule.searchSimilar
          || vectorModule.default?.searchSimilar;
      } catch (fallbackError) {
        // If both imports fail, throw the original error
        throw importError;
      }
    }

    // Generate a generic embedding (Qdrant accepts vectors directly)
    const dummyEmbedding = await generateQueryEmbedding('document');

    // Get all chunks for this entity (filtered by entity_id in search)
    const allResults = await searchSimilar(
      dummyEmbedding,
      100,
      { entity_id: entityId } // Filter by entity_id directly in Qdrant
    );

    // Map results to chunks (already filtered by entity_id)
    const matchingChunks = allResults.map((result) => ({
      text: result.text,
      metadata: result.metadata
    }));

    if (matchingChunks.length === 0) {
      // Entity not found
      throw new ToolError(
        ErrorType.PERMANENT,
        `Entity '${entityId}' not found in KB`,
        { retryable: false }
      );
    }

    // Sort chunks by chunk_index
    matchingChunks.sort((a, b) => (a.metadata?.chunk_index || 0) - (b.metadata?.chunk_index || 0));

    // Reconstruct full text
    const fullText = matchingChunks.map((c) => c.text).join('\n\n');

    // Extract metadata from first chunk (frontmatter is same across chunks)
    const metadata = matchingChunks[0].metadata || {};

    const latency = Date.now() - startTime;
    console.log(`[kb_get] Retrieved ${matchingChunks.length} chunks in ${latency}ms`);

    return {
      ok: true,
      data: {
        id: entityId,
        type: metadata.entity_type || 'unknown',
        title: metadata.title || entityId,
        content: fullText,
        metadata: extractRelevantMetadata(metadata),
        chunks_count: matchingChunks.length
      }
    };
  } catch (error) {
    // Propagate ToolErrors
    if (error.name === 'ToolError') {
      throw error;
    }
    // Wrap unexpected errors
    throw new ToolError(ErrorType.TRANSIENT, `Failed to retrieve entity: ${error.message}`, {
      retryable: true
    });
  }
}

/**
 * Extract relevant metadata, exclude internal fields
 */
function extractRelevantMetadata(metadata) {
  const {
    id,
    vector,
    text,
    file_path,
    chunk_index,
    total_chunks,
    entity_id,
    entity_type,
    title,
    _distance,
    ...relevant
  } = metadata;

  return relevant;
}
