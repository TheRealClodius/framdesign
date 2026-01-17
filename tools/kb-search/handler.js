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

    // Generate query embedding (Qdrant accepts vectors directly)
    let queryEmbedding = [];
    const embeddingStart = Date.now();
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
    const embeddingDuration = Date.now() - embeddingStart;

    // Execute vector search
    // Search for more chunks than requested to account for deduplication
    // If topK=5, we might need to search 10-15 chunks to get 5 unique entities
    const searchLimit = Math.max(topK * 3, 15); // Search 3x more chunks, minimum 15
    
    // Map schema filter field names to Qdrant payload field names
    // Schema uses 'type' but Qdrant index is on 'entity_type'
    const qdrantFilters = {};
    if (args.filters) {
      for (const [key, value] of Object.entries(args.filters)) {
        if (key === 'type') {
          qdrantFilters['entity_type'] = value;
        } else {
          qdrantFilters[key] = value;
        }
      }
    }
    
    let rawResults;
    const searchStart = Date.now();
    try {
      rawResults = await searchSimilar(
        queryEmbedding,
        searchLimit,
        qdrantFilters
      );
    } catch (error) {
      throw new ToolError(ErrorType.TRANSIENT, `Vector search failed: ${error.message}`, {
        retryable: true
      });
    }
    const searchDuration = Date.now() - searchStart;

    // Handle empty results (not an error)
    if (!rawResults || rawResults.length === 0) {
      return {
        ok: true,
        data: {
          results: [],
          total_found: 0,
          query: args.query,
          filters_applied: args.filters || null,
          _timing: {
            embeddingDuration,
            searchDuration
          }
        },
        meta: {
          embeddingDuration,
          searchDuration
        }
      };
    }

    // Transform results to standard format
    const transformedResults = rawResults.map((result) => {
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

    // Deduplicate by entity_id: keep only the highest-scoring chunk per entity
    // The id field is already set to entity_id from metadata (line 129)
    // This ensures we group chunks from the same entity together
    const entityMap = new Map();
    for (const result of transformedResults) {
      const entityId = result.id; // Already set to entity_id from metadata
      const existing = entityMap.get(entityId);
      
      // Keep the result with the highest score for this entity
      if (!existing || result.score > existing.score) {
        entityMap.set(entityId, result);
      }
    }

    // Convert map back to array and sort by score (descending)
    const deduplicatedResults = Array.from(entityMap.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, topK); // Limit to requested topK entities

    const latency = Date.now() - startTime;
    const chunksSearched = rawResults.length;
    const uniqueEntities = deduplicatedResults.length;
    console.log(`[kb_search] Found ${uniqueEntities} unique entities (from ${chunksSearched} chunks) in ${latency}ms`);

    return {
      ok: true,
      data: {
        results: deduplicatedResults,
        total_found: uniqueEntities,
        query: args.query,
        filters_applied: args.filters || null,
        clamped: topK !== originalTopK,
        _timing: {
          embeddingDuration,
          searchDuration
        }
      },
      meta: {
        embeddingDuration,
        searchDuration
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
