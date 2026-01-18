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
      // Entity not found - try to suggest similar entity IDs
      let suggestion = '';
      
      // Extract type and name from entity ID
      const parts = entityId.split(':');
      if (parts.length === 2) {
        const [type, name] = parts;
        
        // Special case: uipath_delegate -> desktop_agent_uipath
        if (name === 'uipath_delegate' && type === 'project') {
          suggestion = ' Did you mean "project:desktop_agent_uipath"?';
        } else {
          // Try to find similar entity IDs by searching for entities of the same type
          try {
            // Get all entities of the same type to suggest alternatives
            const allResults = await searchSimilar(
              dummyEmbedding,
              50,
              { entity_type: type }
            );
            
            // Extract unique entity IDs
            const entityIds = new Set();
            for (const result of allResults) {
              const id = result.metadata?.entity_id;
              if (id && id.startsWith(`${type}:`)) {
                entityIds.add(id);
              }
            }
            
            // Find similar names (simple string similarity)
            const similarIds = Array.from(entityIds).filter(id => {
              const idName = id.split(':')[1];
              if (!idName) return false;
              // Check if names share common words or are similar
              const nameWords = name.toLowerCase().split('_');
              const idWords = idName.toLowerCase().split('_');
              const commonWords = nameWords.filter(w => idWords.includes(w));
              return commonWords.length > 0 || 
                     idName.toLowerCase().includes(name.toLowerCase()) ||
                     name.toLowerCase().includes(idName.toLowerCase());
            });
            
            if (similarIds.length > 0) {
              suggestion = ` Did you mean one of: ${similarIds.slice(0, 3).map(id => `"${id}"`).join(', ')}?`;
            } else if (entityIds.size > 0) {
              // If no similar names, just show some examples of the same type
              const examples = Array.from(entityIds).slice(0, 3);
              suggestion = ` Available ${type} entities include: ${examples.map(id => `"${id}"`).join(', ')}.`;
            }
          } catch (suggestionError) {
            // If suggestion lookup fails, just use the basic error message
            console.warn(`[kb_get] Failed to generate suggestions:`, suggestionError);
          }
        }
      }
      
      throw new ToolError(
        ErrorType.PERMANENT,
        `Entity '${entityId}' not found in KB.${suggestion} Use kb_search to find the correct entity ID.`,
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

    if (isAsset) {
      // Assets are single chunks - return asset-specific data
      return {
        ok: true,
        data: {
          id: entityId,
          type: 'asset',
          entity_type: entityType,
          title: metadata.title || entityId,
          description: matchingChunks[0].text || '',
          path: metadata.path || '',
          caption: metadata.caption || metadata.title || '',
          related_entities: tryParseJSON(metadata.related_entities) || [],
          tags: tryParseJSON(metadata.tags) || [],
          metadata: extractRelevantMetadata(metadata)
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
          chunks_count: matchingChunks.length
        }
      };
    }
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
