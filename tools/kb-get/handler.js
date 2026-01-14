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
      const embeddingModule = await import('@/lib/services/embedding-service');
      const vectorModule = await import('@/lib/services/vector-store-service');
      generateQueryEmbedding = embeddingModule.generateQueryEmbedding;
      searchSimilar = vectorModule.searchSimilar;
    } catch {
      // Fallback for Node.js runtime (voice server)
      // Use relative paths WITHOUT extension - avoids webpack static analysis
      // Node.js ESM will resolve .ts files automatically at runtime
      const embeddingPath = '../../lib/services/embedding-service';
      const vectorPath = '../../lib/services/vector-store-service';
      const embeddingModule = await import(embeddingPath);
      const vectorModule = await import(vectorPath);
      generateQueryEmbedding = embeddingModule.generateQueryEmbedding;
      searchSimilar = vectorModule.searchSimilar;
    }

    // Generate a generic embedding (we'll filter results anyway)
    const dummyEmbedding = await generateQueryEmbedding('document');

    // Get many results (up to 100) to ensure we get all chunks
    const allResults = await searchSimilar(dummyEmbedding, 100, {}, 'document');

    // Filter for matching entity_id
    const matchingChunks = allResults
      .filter((result) => result.metadata?.entity_id === entityId)
      .map((result) => ({
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
