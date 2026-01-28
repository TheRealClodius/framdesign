/**
 * kb_search Tool Handler
 *
 * Semantic search over knowledge base using vector embeddings
 */

import { ErrorType, ToolError } from '../_core/error-types.js';

// Import blob storage service for GCS URL resolution and optional image fetch
let resolveBlobUrl;
let fetchAssetBuffer;
async function loadBlobService() {
  if (!resolveBlobUrl || !fetchAssetBuffer) {
    try {
      const blobModule = await import('@/lib/services/blob-storage-service');
      resolveBlobUrl = blobModule.resolveBlobUrl || blobModule.default?.resolveBlobUrl;
      fetchAssetBuffer = blobModule.fetchAssetBuffer || blobModule.default?.fetchAssetBuffer;
    } catch (importError) {
      // Fallback for Node.js runtime (voice server)
      // Use a function to create the import path dynamically so webpack doesn't analyze it
      try {
        const getImportPath = (base) => `../../lib/services/${base}`;
        const blobPath = getImportPath('blob-storage-service');
        const blobModule = await import(/* webpackIgnore: true */ blobPath);
        resolveBlobUrl = blobModule.resolveBlobUrl || blobModule.default?.resolveBlobUrl;
        fetchAssetBuffer = blobModule.fetchAssetBuffer || blobModule.default?.fetchAssetBuffer;
      } catch (fallbackError) {
        console.warn('[kb_search] Failed to load blob storage service:', fallbackError);
        // Will skip markdown generation for assets if service unavailable
      }
    }
  }
  return { resolveBlobUrl, fetchAssetBuffer };
}

function extractHttpStatus(error) {
  if (!error || typeof error !== 'object') return undefined;
  return (
    error.status ||
    error.statusCode ||
    error.code ||
    error.response?.status ||
    error.response?.statusCode ||
    error.data?.status ||
    error.data?.statusCode
  );
}

function isServiceUnavailable(error) {
  const status = extractHttpStatus(error);
  if (status === 503) return true;
  const message = (error?.message || String(error || '')).toLowerCase();
  return message.includes('service unavailable') || message.includes('503');
}

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
  const includeImageData = Boolean(args.include_image_data) && !isVoiceMode;

  if (topK > 3) {
    topK = 3; // Clamp for stability
    console.log('[kb_search] Stability clamp: clamped top_k from', originalTopK, 'to 3');
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
      const errorMessage = error.message || String(error);
      
      // Classify embedding errors
      if (errorMessage.includes('API key') || errorMessage.includes('Invalid')) {
        throw new ToolError(ErrorType.AUTH, errorMessage, { retryable: false });
      }
      if (errorMessage.includes('rate limit') || errorMessage.includes('quota')) {
        throw new ToolError(ErrorType.RATE_LIMIT, errorMessage, { retryable: true });
      }
      if (errorMessage.includes('timeout')) {
        throw new ToolError(ErrorType.TRANSIENT, errorMessage, { retryable: true });
      }
      throw new ToolError(ErrorType.TRANSIENT, `Embedding generation failed: ${errorMessage}`, {
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
      const errorMessage = error.message || String(error);
      if (isServiceUnavailable(error)) {
        const status = extractHttpStatus(error) || 503;
        throw new ToolError(
          ErrorType.TRANSIENT,
          `Vector store unavailable (Qdrant ${status}). Please try again later.`,
          {
            retryable: false,
            details: {
              service: 'qdrant',
              httpStatus: status,
              message: errorMessage
            }
          }
        );
      }
      throw new ToolError(ErrorType.TRANSIENT, `Vector search failed: ${errorMessage}`, {
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

    // Load blob service for asset URL resolution
    const blobService = await loadBlobService();
    
    // Transform results to standard format
    const transformedResults = await Promise.all(rawResults.map(async (result) => {
      const snippet = args.include_snippets !== false && result.text
        ? result.text.substring(0, 200) + (result.text.length > 200 ? '...' : '')
        : null;

      const entityType = result.metadata?.entity_type || 'unknown';
      const isAsset = ['photo', 'video', 'gif', 'diagram'].includes(entityType);
      
      const baseResult = {
        id: result.metadata?.entity_id || result.id,
        type: entityType,
        title: result.metadata?.title || result.id,
        snippet,
        score: result.score,
        source_type: 'kb_document',
        last_updated: null, // Not tracked yet
        metadata: extractRelevantMetadata(result.metadata || {})
      };
      
      // For assets, resolve blob_id to URL and generate markdown
      if (isAsset) {
        const blobId = result.metadata?.blob_id;
        const extension = result.metadata?.file_extension;
        const caption = result.metadata?.caption || result.metadata?.title || '';
        
        if (blobId && extension && blobService?.resolveBlobUrl) {
          try {
            const assetUrl = await blobService.resolveBlobUrl(blobId, extension);
            const entityType = result.metadata?.entity_type || '';
            
            // Handle videos with HTML video tag, images/GIFs with markdown
            let markdown;
            if (entityType === 'video' || extension === 'mov' || extension === 'mp4' || extension === 'webm') {
              markdown = `<video controls><source src="${assetUrl}" type="video/${extension === 'mov' ? 'quicktime' : extension}">Your browser does not support the video tag.</video>\n\n${caption ? `*${caption}*` : ''}`;
            } else {
              // Images and GIFs use markdown image syntax
              markdown = `![${caption}](${assetUrl})`;
            }
            
            // Add markdown to metadata
            baseResult.metadata.markdown = markdown;
            baseResult.metadata.url = assetUrl;
            baseResult.metadata.blob_id = blobId;
          } catch (blobError) {
            console.warn(`[kb_search] Failed to resolve blob URL for ${baseResult.id}:`, blobError.message);
            // Fallback to old path if available
            if (result.metadata?.path) {
              const entityType = result.metadata?.entity_type || '';
              const path = result.metadata.path;
              let markdown;
              if (entityType === 'video' || path.match(/\.(mov|mp4|webm)$/i)) {
                const ext = path.match(/\.(\w+)$/)?.[1] || 'mp4';
                markdown = `<video controls><source src="${path}" type="video/${ext === 'mov' ? 'quicktime' : ext}">Your browser does not support the video tag.</video>\n\n${caption ? `*${caption}*` : ''}`;
              } else {
                markdown = `![${caption}](${path})`;
              }
              baseResult.metadata.markdown = markdown;
              baseResult.metadata.url = result.metadata.path;
            }
          }
        } else if (result.metadata?.path) {
          // Fallback to old path if blob_id not available
          const markdown = `![${caption}](${result.metadata.path})`;
          baseResult.metadata.markdown = markdown;
          baseResult.metadata.url = result.metadata.path;
        }
      }
      
      return baseResult;
    }));

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
    
    // Add detailed timing to the result for observability
    const finalTiming = {
      total: latency,
      embedding: embeddingDuration,
      search: searchDuration,
      processing: latency - (embeddingDuration + searchDuration)
    };
    
    console.log(`[kb_search] Found ${uniqueEntities} unique entities (from ${chunksSearched} chunks) in ${latency}ms`, finalTiming);

    // Optionally attach image data for the top result (text mode only)
    let imageData = null;
    let imageDataFor = null;
    if (includeImageData && deduplicatedResults.length > 0) {
      const topResult = deduplicatedResults[0];
      const isVisual = ['photo', 'diagram', 'gif'].includes(topResult.type);
      const blobId = topResult.metadata?.blob_id;
      const extension = topResult.metadata?.file_extension;

      if (isVisual && blobId && extension && blobService?.fetchAssetBuffer) {
        try {
          const imageBuffer = await blobService.fetchAssetBuffer(blobId, extension);
          const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB cap to avoid oversized payloads
          if (imageBuffer.length > MAX_IMAGE_BYTES) {
            console.warn(`[kb_search] Skipping image data for ${topResult.id} (size ${Math.round(imageBuffer.length / 1024)}KB)`);
          } else {
            const mimeTypeMap = {
              'png': 'image/png',
              'jpg': 'image/jpeg',
              'jpeg': 'image/jpeg',
              'gif': 'image/gif',
              'webp': 'image/webp'
            };
            const mimeType = mimeTypeMap[extension.toLowerCase()] || 'image/png';
            imageData = {
              mimeType,
              data: imageBuffer.toString('base64')
            };
            imageDataFor = {
              id: topResult.id,
              title: topResult.title,
              caption: topResult.metadata?.caption || topResult.title || ''
            };
            console.log(`[kb_search] Fetched image data for ${topResult.id} (${Math.round(imageBuffer.length / 1024)}KB)`);
          }
        } catch (imageError) {
          console.warn(`[kb_search] Failed to fetch image buffer for ${topResult.id}:`, imageError.message);
        }
      }
    }

    const responseData = {
      results: deduplicatedResults,
      total_found: uniqueEntities,
      query: args.query,
      filters_applied: args.filters || null,
      clamped: topK !== originalTopK,
      _instructions: `KB search complete. Found ${uniqueEntities} unique entities. ${imageData ? `✅ Pixel data included for top result: '${imageDataFor?.title}'.` : "❌ No pixel data included. For visual analysis, call kb_get with include_image_data: true for the specific asset ID."} To show assets, use the provided 'metadata.markdown' fields.`,
      _timing: finalTiming
    };

    if (imageData) {
      responseData._imageData = imageData;
      responseData.image_data_for = imageDataFor;
    }

    return {
      ok: true,
      data: responseData,
      meta: {
        _timing: finalTiming
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
