/**
 * kb_get Tool Handler
 *
 * Direct ID-based retrieval of KB documents
 * Uses a workaround: searches with large top_k and filters by entity_id
 */

import { ErrorType, ToolError } from '../_core/error-types.js';
import {
  extractHttpStatus,
  isServiceUnavailable
} from '../_core/helpers.js';
import { emitToolEvent } from '../_core/tool-events.js';
import { buildStableAssetRef, buildAssetMarkdown } from '../_core/asset-ref.js';

function normalizeEntityId(rawId) {
  if (typeof rawId !== 'string') return rawId;
  const [type, name, ...rest] = rawId.split(':');
  if (!type || !name || rest.length > 0) {
    return rawId.toLowerCase();
  }
  return `${type.toLowerCase()}:${name.toLowerCase()}`;
}

/**
 * Execute kb_get tool
 *
 * @param {object} context - Execution context
 * @returns {Promise<ToolResponse>} - Result envelope
 */
export async function execute(context) {
  const { args, capabilities } = context;
  const startTime = Date.now();
  const rawEntityId = args.id;
  const entityId = normalizeEntityId(rawEntityId);

  // Check capabilities.voice or fallback to checking meta/context for voice mode
  const isVoiceMode = capabilities?.voice === true;
  const includeImageData = Boolean(args.include_image_data) && !isVoiceMode;

  if (rawEntityId !== entityId) {
    console.log(`[kb_get] Normalized entity id "${rawEntityId}" -> "${entityId}"`);
  }
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
    const embeddingStart = Date.now();
    const dummyEmbedding = await generateQueryEmbedding('document');
    const embeddingDuration = Date.now() - embeddingStart;

    // Get all chunks for this entity (filtered by entity_id in search)
    const searchStart = Date.now();
    const allResults = await searchSimilar(
      dummyEmbedding,
      100,
      { entity_id: entityId } // Filter by entity_id directly in Qdrant
    );
    const searchDuration = Date.now() - searchStart;

    // Map results to chunks (already filtered by entity_id)
    const matchingChunks = allResults.map((result) => ({
      text: result.text,
      metadata: result.metadata
    }));

    if (matchingChunks.length === 0) {
      // Entity not found - fail fast without suggestions
      throw new ToolError(
        ErrorType.PERMANENT,
        `Entity '${entityId}' not found in KB. Use kb_search to find entities.`,
        { retryable: false }
      );
    }

    // Extract metadata from first chunk (frontmatter is same across chunks)
    const metadata = matchingChunks[0].metadata || {};
    const entityType = metadata.entity_type || 'unknown';

    // Check if this is an asset entity type
    const isAsset = ['photo', 'video', 'gif', 'diagram'].includes(entityType);

    const latency = Date.now() - startTime;
    console.log(`[kb_get] Retrieved ${matchingChunks.length} chunks in ${latency}ms (type: ${entityType})`);

    // Add detailed timing for observability
    const finalTiming = {
      total: latency,
      embedding: embeddingDuration,
      search: searchDuration,
      processing: latency - (embeddingDuration + searchDuration)
    };

    if (isAsset) {
      // Assets are single chunks - return asset-specific data with GCS URL resolution
      const blobId = metadata.blob_id;
      const extension = metadata.file_extension;

      // Build stable asset reference (short /kb-assets/ path instead of signed URL)
      // Client resolves to signed GCS URL at render time
      let assetUrl = '';
      let markdown = '';
      let imageData = null; // For multimodal analysis
      let imageDataFetchError = null; // Track why image data wasn't fetched

      if (blobId && extension) {
        // Check if asset exists in GCS (dead asset detection)
        let assetMissing = false;
        let fetchAssetBuffer = null;

        try {
          let resolveBlobUrlSafe;
          try {
            const blobModule = await import('@/lib/services/blob-storage-service');
            resolveBlobUrlSafe = blobModule.resolveBlobUrlSafe || blobModule.default?.resolveBlobUrlSafe;
            fetchAssetBuffer = blobModule.fetchAssetBuffer || blobModule.default?.fetchAssetBuffer;
          } catch {
            const getPath = (name) => `../../lib/services/${name}`;
            const blobModule = await import(/* webpackIgnore: true */ getPath('blob-storage-service'));
            resolveBlobUrlSafe = blobModule.resolveBlobUrlSafe || blobModule.default?.resolveBlobUrlSafe;
            fetchAssetBuffer = blobModule.fetchAssetBuffer || blobModule.default?.fetchAssetBuffer;
          }

          if (resolveBlobUrlSafe) {
            const resolved = await resolveBlobUrlSafe(blobId, extension);
            assetMissing = !resolved.exists;
          }
        } catch (blobError) {
          // Blob service unavailable — emit stable ref optimistically
          console.warn(`[kb_get] Blob service check failed for ${entityId}:`, blobError.message);
        }

        if (assetMissing) {
          emitToolEvent('dead_asset', {
            toolId: 'kb_get',
            message: `Asset missing from GCS: ${entityId}`,
            details: { entityId, blobId, extension }
          });
          console.warn(`[kb_get] Dead asset detected: ${entityId} (blob: ${blobId}.${extension})`);
          imageDataFetchError = `Asset file missing from storage: assets/${blobId}.${extension}`;
          markdown = '';
          assetUrl = '';
        } else {
          const caption = metadata.caption || metadata.title || '';
          assetUrl = buildStableAssetRef(blobId, extension);
          markdown = buildAssetMarkdown(entityType, blobId, extension, caption);

          // For visual assets, fetch image data ONLY if requested for multimodal analysis
          if (includeImageData && ['photo', 'diagram', 'gif'].includes(entityType)) {
            console.log(`[kb_get] Attempting image data fetch for ${entityId}`, {
              blobId,
              extension,
              entityType
            });

            try {
              if (!fetchAssetBuffer) {
                imageDataFetchError = 'fetchAssetBuffer service not available';
                throw new Error(imageDataFetchError);
              }
              const imageBuffer = await fetchAssetBuffer(blobId, extension);

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

              console.log(`[kb_get] Fetched image data for ${entityId} (${Math.round(imageBuffer.length / 1024)}KB)`);
            } catch (imageError) {
              imageDataFetchError = imageError.message;
              console.warn(`[kb_get] Failed to fetch image buffer for ${entityId}:`, imageError.message);
            }
          }
        }
      } else {
        // Missing blob_id or extension - use old path as fallback
        if (metadata.path) {
          assetUrl = metadata.path;
          const caption = metadata.caption || metadata.title || '';
          markdown = `![${caption}](${metadata.path})`;
        } else {
          throw new ToolError(
            ErrorType.PERMANENT,
            `Asset ${entityId} missing blob_id/file_extension in metadata. Cannot generate URL.`,
            { retryable: false }
          );
        }
      }

      // Detect if asset is dead (missing from storage)
      const isDead = !assetUrl && blobId && extension;

      return {
        ok: true,
        data: {
          id: entityId,
          type: 'asset',
          entity_type: entityType,
          title: metadata.title || entityId,
          description: matchingChunks[0].text || '',
          blob_id: blobId || null,
          url: assetUrl,
          markdown: markdown,
          path: metadata.path || '', // Keep for backward compatibility
          caption: metadata.caption || metadata.title || '',
          related_entities: tryParseJSON(metadata.related_entities) || [],
          tags: tryParseJSON(metadata.tags) || [],
          metadata: extractRelevantMetadata(metadata),
          _instructions: buildImageInstructions(entityId, entityType, imageData, includeImageData, imageDataFetchError, blobId, extension, markdown, isDead),
          _timing: finalTiming,
          _imageData: imageData, // Image data for multimodal analysis (internal, excluded from display)
          _diagnostics: isDead ? { dead_asset: true, blob_id: blobId, extension } : undefined
        },
        meta: {
          _timing: finalTiming
        }
      };
    } else {
      // Text documents - reconstruct full content from chunks
      // Sort chunks by chunk_index
      matchingChunks.sort((a, b) => (a.metadata?.chunk_index || 0) - (b.metadata?.chunk_index || 0));

      // Reconstruct full text
      const fullText = matchingChunks.map((c) => c.text).join('\n\n');

      return {
        ok: true,
        data: {
          id: entityId,
          type: entityType,
          title: metadata.title || entityId,
          content: fullText,
          metadata: extractRelevantMetadata(metadata),
          chunks_count: matchingChunks.length,
          _timing: finalTiming
        },
        meta: {
          _timing: finalTiming
        }
      };
    }
  } catch (error) {
    // Propagate ToolErrors
    if (error.name === 'ToolError') {
      throw error;
    }
    if (isServiceUnavailable(error)) {
      const status = extractHttpStatus(error) || 503;
      throw new ToolError(
        ErrorType.TRANSIENT,
        `Vector store unavailable (Qdrant ${status}). Please try again later.`,
        {
          retryable: false,
          details: {
            service: 'qdrant',
            httpStatus: status
          }
        }
      );
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
    path, // Exclude path from generic metadata (it's in main data for assets)
    caption, // Exclude caption from generic metadata (it's in main data for assets)
    related_entities, // Exclude related_entities (it's in main data for assets)
    tags, // Exclude tags (it's in main data for assets)
    ...relevant
  } = metadata;

  return relevant;
}

/**
 * Safely parse JSON strings, return undefined if invalid
 */
function tryParseJSON(jsonString) {
  if (typeof jsonString !== 'string') return jsonString;
  try {
    return JSON.parse(jsonString);
  } catch {
    return undefined;
  }
}

/**
 * Build detailed instructions for asset retrieval results
 * Includes specific failure reasons when image data couldn't be fetched
 */
function buildImageInstructions(entityId, entityType, imageData, includeImageData, imageDataFetchError, blobId, extension, markdown, isDead = false) {
  // Dead asset: warn the agent immediately
  if (isDead) {
    return `⚠️ DEAD ASSET: "${entityId}" exists in the knowledge base index but the actual file is missing from storage (blob: assets/${blobId}.${extension}). DO NOT share an image link for this asset — it will appear broken. You may still reference the asset's title and description from the metadata.`;
  }

  let imageDataStatus = '';

  if (imageData) {
    imageDataStatus = '✅ Pixel data included for multimodal analysis.';
  } else if (includeImageData) {
    // User requested image data but it wasn't included - explain why
    const reasons = [];
    if (!blobId) reasons.push('missing blob_id in metadata');
    if (!extension) reasons.push('missing file_extension in metadata');
    if (!['photo', 'diagram', 'gif'].includes(entityType)) {
      reasons.push(`entity_type '${entityType}' does not support pixel data (only photo, diagram, gif)`);
    }
    if (imageDataFetchError) reasons.push(imageDataFetchError);

    const reasonText = reasons.length > 0 ? reasons.join('; ') : 'unknown error';
    imageDataStatus = `❌ Pixel data requested but NOT included. Reason: ${reasonText}. To retry, call kb_get with include_image_data: true for ID: '${entityId}'.`;
  } else {
    // User didn't request image data
    imageDataStatus = `❌ Pixel data not requested. You CANNOT see this image. Do NOT describe colors, layout, or visual details — only describe what the metadata text tells you. To actually see the image, call kb_get with include_image_data: true for ID: '${entityId}'.`;
  }

  return `Asset metadata retrieved. ${imageDataStatus} To display the asset, include this markdown: ${markdown}`;
}
