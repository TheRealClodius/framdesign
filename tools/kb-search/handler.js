/**
 * kb_search Tool Handler
 *
 * Semantic search over knowledge base using vector embeddings
 */

import { ErrorType, ToolError } from '../_core/error-types.js';
import {
  extractHttpStatus,
  isServiceUnavailable
} from '../_core/helpers.js';
import { emitToolEvent } from '../_core/tool-events.js';

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

  // Clamp top_k based on mode:
  // - Voice mode: max 3 (to keep responses concise)
  // - Text mode: max 10 (as documented in schema)
  const maxTopK = isVoiceMode ? 3 : 10;
  if (topK > maxTopK) {
    topK = maxTopK;
    console.log(`[kb_search] ${isVoiceMode ? 'Voice mode' : 'Max limit'} clamp: clamped top_k from ${originalTopK} to ${topK}`);
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
    // 'related_to' maps to 'related_entities' array with $contains marker
    const qdrantFilters = {};
    if (args.filters) {
      for (const [key, value] of Object.entries(args.filters)) {
        if (key === 'type') {
          qdrantFilters['entity_type'] = value;
        } else if (key === 'related_to') {
          // Map related_to to related_entities array field with $contains marker
          // This signals vector-store-service to use array membership filtering
          qdrantFilters['related_entities'] = { $contains: value };
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

    // Load blob service for asset URL resolution using direct imports
    let resolveBlobUrlSafe, resolveBlobUrl, fetchAssetBuffer;
    try {
      const blobModule = await import('@/lib/services/blob-storage-service');
      resolveBlobUrlSafe = blobModule.resolveBlobUrlSafe || blobModule.default?.resolveBlobUrlSafe;
      resolveBlobUrl = blobModule.resolveBlobUrl || blobModule.default?.resolveBlobUrl;
      fetchAssetBuffer = blobModule.fetchAssetBuffer || blobModule.default?.fetchAssetBuffer;
    } catch {
      const getPath = (name) => `../../lib/services/${name}`;
      const blobModule = await import(/* webpackIgnore: true */ getPath('blob-storage-service'));
      resolveBlobUrlSafe = blobModule.resolveBlobUrlSafe || blobModule.default?.resolveBlobUrlSafe;
      resolveBlobUrl = blobModule.resolveBlobUrl || blobModule.default?.resolveBlobUrl;
      fetchAssetBuffer = blobModule.fetchAssetBuffer || blobModule.default?.fetchAssetBuffer;
    }

    // Track dead assets for diagnostics
    const deadAssets = [];
    
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

        if (blobId && extension && (resolveBlobUrlSafe || resolveBlobUrl)) {
          try {
            // Use safe resolver to detect dead assets before generating URLs
            let assetUrl;
            let assetMissing = false;

            if (resolveBlobUrlSafe) {
              const resolved = await resolveBlobUrlSafe(blobId, extension);
              assetUrl = resolved.url;
              assetMissing = !resolved.exists;
            } else {
              assetUrl = await resolveBlobUrl(blobId, extension);
            }

            if (assetMissing) {
              // Track dead asset for diagnostics
              deadAssets.push({ id: baseResult.id, blob_id: blobId, extension });
              baseResult.metadata._dead = true;
              emitToolEvent('dead_asset', {
                toolId: 'kb_search',
                message: `Asset missing from GCS: ${baseResult.id}`,
                details: { entityId: baseResult.id, blobId, extension }
              });
              console.warn(`[kb_search] Dead asset detected: ${baseResult.id} (blob: ${blobId}.${extension})`);
            } else {
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
            }
          } catch (blobError) {
            console.warn(`[kb_search] Failed to resolve blob URL for ${baseResult.id}:`, blobError.message);
            deadAssets.push({ id: baseResult.id, blob_id: blobId, extension, error: blobError.message });
            baseResult.metadata._dead = true;
          }
        } else if (result.metadata?.path) {
          // Fallback to old path if blob_id not available
          const markdown = `![${caption}](${result.metadata.path})`;
          baseResult.metadata.markdown = markdown;
          baseResult.metadata.url = result.metadata.path;
          baseResult.metadata._legacy_path = true;
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

    // Enrich top 2 non-asset results with related asset hints
    // This lets the agent know what visuals are available without a separate search
    const ASSET_TYPES = new Set(['photo', 'video', 'gif', 'diagram']);
    const nonAssetResults = deduplicatedResults.filter(r => !ASSET_TYPES.has(r.type));
    const topNonAssets = nonAssetResults.slice(0, 2);

    if (!isVoiceMode && topNonAssets.length > 0 && queryEmbedding.length > 0) {
      const assetHintStart = Date.now();
      await Promise.all(topNonAssets.map(async (result) => {
        try {
          const entityId = result.id;
          // Search for assets related to this entity using the same embedding
          const assetResults = await searchSimilar(
            queryEmbedding,
            10, // Fetch up to 10 to get a good count
            { related_entities: { $contains: entityId } }
          );

          // Filter to only visual asset types
          const assetItems = (assetResults || []).filter(ar => {
            const aType = ar.metadata?.entity_type || '';
            return ASSET_TYPES.has(aType);
          });

          if (assetItems.length > 0) {
            // Deduplicate by entity_id
            const seenIds = new Set();
            const uniqueAssets = [];
            for (const a of assetItems) {
              const aId = a.metadata?.entity_id || a.id;
              if (!seenIds.has(aId)) {
                seenIds.add(aId);
                uniqueAssets.push(a);
              }
            }

            // Collect types present
            const assetTypeSet = new Set(uniqueAssets.map(a => a.metadata?.entity_type));

            // Build sample (top 3 by relevance)
            const sample = uniqueAssets.slice(0, 3).map(a => ({
              id: a.metadata?.entity_id || a.id,
              type: a.metadata?.entity_type || 'unknown',
              title: a.metadata?.title || a.id
            }));

            result._assetHints = {
              count: uniqueAssets.length,
              types: Array.from(assetTypeSet),
              sample
            };
          }
        } catch (hintError) {
          console.warn(`[kb_search] Failed to fetch asset hints for ${result.id}:`, hintError.message);
          // Non-critical: continue without hints
        }
      }));
      console.log(`[kb_search] Asset hints enrichment took ${Date.now() - assetHintStart}ms`);
    }

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

      if (isVisual && blobId && extension && fetchAssetBuffer) {
        try {
          const imageBuffer = await fetchAssetBuffer(blobId, extension);
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

    // Build diagnostics for observability
    const diagnostics = {};
    if (deadAssets.length > 0) {
      diagnostics.dead_assets = deadAssets;
      console.warn(`[kb_search] ${deadAssets.length} dead asset(s) detected in results`);
    }
    const legacyPathResults = deduplicatedResults.filter(r => r.metadata?._legacy_path);
    if (legacyPathResults.length > 0) {
      diagnostics.legacy_path_assets = legacyPathResults.map(r => r.id);
    }

    const responseData = {
      results: deduplicatedResults,
      total_found: uniqueEntities,
      query: args.query,
      filters_applied: args.filters || null,
      clamped: topK !== originalTopK,
      _instructions: buildInstructions(uniqueEntities, imageData, imageDataFor, deduplicatedResults, deadAssets),
      _timing: finalTiming,
      _diagnostics: Object.keys(diagnostics).length > 0 ? diagnostics : undefined
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
 * Build the _instructions string, including asset hint guidance and dead asset warnings
 */
function buildInstructions(uniqueEntities, imageData, imageDataFor, results, deadAssets = []) {
  let base = `KB search complete. Found ${uniqueEntities} unique entities. `;
  base += imageData
    ? `✅ Pixel data included for top result: '${imageDataFor?.title}'.`
    : "❌ No pixel data included. For visual analysis, call kb_get with include_image_data: true for the specific asset ID.";
  base += " To show assets, use the provided 'metadata.markdown' fields.";

  // Warn agent about dead assets so it doesn't share broken images
  if (deadAssets.length > 0) {
    const deadIds = deadAssets.map(d => d.id).join(', ');
    base += `\n\n⚠️ DEAD ASSETS (${deadAssets.length}): The following assets are missing from storage and MUST NOT be shared with the user: ${deadIds}. Their images would appear broken.`;
  }

  // Add asset hint guidance for results that have them
  const hintsLines = [];
  for (const r of results) {
    if (r._assetHints && r._assetHints.count > 0) {
      const types = r._assetHints.types.join(', ');
      hintsLines.push(
        `${r.title} has ${r._assetHints.count} visual asset(s) (${types}). To show them, search with filters.related_to: "${r.id}".`
      );
    }
  }
  if (hintsLines.length > 0) {
    base += '\n\nAsset availability:\n' + hintsLines.join('\n');
    base += '\nWhen discussing these entities, consider fetching a representative visual to enrich the narrative.';
  }

  // Add suggestion seeds from related projects found in results
  const projectResults = results.filter(r => r.type === 'project');
  if (projectResults.length > 1) {
    const related = projectResults.slice(1, 3).map(r => r.title);
    base += `\nRelated projects found: ${related.join(', ')}. These can be suggested for further exploration.`;
  }

  return base;
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
