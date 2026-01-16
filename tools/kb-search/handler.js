/**
 * kb_search Tool Handler
 *
 * Semantic search over knowledge base using vector embeddings
 */

import { ErrorType, ToolError } from '../_core/error-types.js';

/**
 * Execute kb_search tool
 *
 * @param {object} context - Execution context
 * @returns {Promise<ToolResponse>} - Result envelope
 */
export async function execute(context) {
  const { args, capabilities, meta } = context;
  const startTime = Date.now();

  // Mode-aware parameter adjustment
  let topK = args.top_k || 5;
  const originalTopK = topK;

  // Check capabilities.voice or fallback to checking meta/context for voice mode
  const isVoiceMode = capabilities?.voice === true;

  if (isVoiceMode && topK > 3) {
    topK = 3; // Clamp for voice mode
    console.log('[kb_search] Voice mode detected: clamped top_k from', originalTopK, 'to 3');
  }

  try {
    // Dynamically import services (avoid bundling issues)
    // Use path alias for Next.js compatibility, fallback to relative for Node.js
    let generateQueryEmbedding, searchSimilar;
    
    try {
      // Try Next.js path alias first (works in Next.js webpack)
      const embeddingModule = await import('@/lib/services/embedding-service');
      const vectorModule = await import('@/lib/services/vector-store-service');
      generateQueryEmbedding = embeddingModule.generateQueryEmbedding
        || embeddingModule.default?.generateQueryEmbedding;
      searchSimilar = vectorModule.searchSimilar
        || vectorModule.default?.searchSimilar;
    } catch {
      // Fallback for Node.js runtime (voice server)
      // Use relative paths WITHOUT extension - avoids webpack static analysis
      // Node.js ESM will resolve .ts files automatically at runtime
      const embeddingPath = '../../lib/services/embedding-service';
      const vectorPath = '../../lib/services/vector-store-service';
      const embeddingModule = await import(embeddingPath);
      const vectorModule = await import(vectorPath);
      generateQueryEmbedding = embeddingModule.generateQueryEmbedding
        || embeddingModule.default?.generateQueryEmbedding;
      searchSimilar = vectorModule.searchSimilar
        || vectorModule.default?.searchSimilar;
    }

    // Generate query embedding (Qdrant accepts vectors directly)
    let queryEmbedding = [];
    try {
      queryEmbedding = await generateQueryEmbedding(args.query);
    } catch (error) {
      // Classify embedding errors
      if (error.message?.includes('API key') || error.message?.includes('Invalid')) {
        throw new ToolError(ErrorType.AUTH, error.message, { retryable: false });
      }
      if (error.message?.includes('rate limit') || error.message?.includes('quota')) {
        throw new ToolError(ErrorType.RATE_LIMIT, error.message, { retryable: true });
      }
      if (error.message?.includes('timeout')) {
        throw new ToolError(ErrorType.TRANSIENT, error.message, { retryable: true });
      }
      throw new ToolError(ErrorType.TRANSIENT, `Embedding generation failed: ${error.message}`, {
        retryable: true
      });
    }

    // Execute vector search
    let rawResults;
    try {
      rawResults = await searchSimilar(
        queryEmbedding,
        topK,
        args.filters || {}
      );
    } catch (error) {
      throw new ToolError(ErrorType.TRANSIENT, `Vector search failed: ${error.message}`, {
        retryable: true
      });
    }

    // Handle empty results (not an error)
    if (!rawResults || rawResults.length === 0) {
      return {
        ok: true,
        data: {
          results: [],
          total_found: 0,
          query: args.query,
          filters_applied: args.filters || null
        }
      };
    }

    // Transform results to standard format
    const results = rawResults.map((result) => {
      const snippet = args.include_snippets !== false && result.text
        ? result.text.substring(0, 200) + (result.text.length > 200 ? '...' : '')
        : null;

      return {
        id: result.metadata?.entity_id || result.id,
        type: result.metadata?.entity_type || 'unknown',
        title: result.metadata?.title || result.id,
        snippet,
        score: result.score,
        source_type: 'kb_document',
        last_updated: null, // Not tracked yet
        metadata: extractRelevantMetadata(result.metadata || {})
      };
    });

    const latency = Date.now() - startTime;
    console.log(`[kb_search] Found ${results.length} results in ${latency}ms`);

    return {
      ok: true,
      data: {
        results,
        total_found: results.length,
        query: args.query,
        filters_applied: args.filters || null,
        clamped: topK !== originalTopK
      }
    };
  } catch (error) {
    // Propagate ToolErrors, wrap unexpected errors
    if (error.name === 'ToolError') {
      throw error;
    }
    throw new ToolError(ErrorType.INTERNAL, `Unexpected error: ${error.message}`, {
      retryable: false
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
    ...relevant
  } = metadata;

  return {
    file_path,
    chunk_index,
    total_chunks,
    ...relevant
  };
}
