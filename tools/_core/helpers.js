/**
 * Shared helper functions for tool handlers
 * Eliminates duplication across kb-search, kb-get, and other tools
 */

/**
 * Import a module with fallback for bundled vs unbundled environments
 */
export async function importWithFallback(aliasPath, relativePath) {
  try {
    return await import(aliasPath);
  } catch {
    return await import(/* webpackIgnore: true */ relativePath);
  }
}

/**
 * Extract HTTP status code from various error formats
 */
export function extractHttpStatus(error) {
  if (error?.status) return error.status;
  if (error?.response?.status) return error.response.status;
  const match = error?.message?.match(/status[:\s]*(\d{3})/i);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Check if error indicates service unavailable (503)
 */
export function isServiceUnavailable(error) {
  const status = extractHttpStatus(error);
  return status === 503 || error?.message?.toLowerCase().includes('service unavailable');
}

/**
 * Load blob storage service with environment fallback
 * Returns object with { resolveBlobUrl, fetchAssetBuffer }
 */
let cachedBlobService = null;
export async function loadBlobService() {
  if (!cachedBlobService) {
    const mod = await importWithFallback(
      '@/lib/services/blob-storage-service',
      '../../lib/services/blob-storage-service.js'
    );
    cachedBlobService = {
      resolveBlobUrl: mod.resolveBlobUrl || mod.default?.resolveBlobUrl,
      fetchAssetBuffer: mod.fetchAssetBuffer || mod.default?.fetchAssetBuffer
    };
  }
  return cachedBlobService;
}

/**
 * Generate markdown for an asset (image or video)
 */
export function generateAssetMarkdown(type, url, caption = '') {
  const safeCaption = caption || 'Asset';
  if (['video', 'mov', 'mp4', 'webm'].some(t => type?.toLowerCase().includes(t))) {
    return `<video controls src="${url}" title="${safeCaption}">Video: ${safeCaption}</video>`;
  }
  return `![${safeCaption}](${url})`;
}

/**
 * Extract relevant metadata, excluding internal fields
 */
export function extractRelevantMetadata(metadata, additionalExcludes = []) {
  const defaultExcludes = ['id', 'vector', 'text', 'file_path', 'chunk_index', 'total_chunks', 'entity_id'];
  const excludeSet = new Set([...defaultExcludes, ...additionalExcludes]);

  const result = {};
  for (const [key, value] of Object.entries(metadata || {})) {
    if (!excludeSet.has(key) && value !== undefined && value !== null) {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Normalize entity ID (lowercase, handle prefixes)
 */
export function normalizeEntityId(id) {
  if (!id) return null;
  const normalized = String(id).toLowerCase().trim();
  // Handle "type:id" format
  if (normalized.includes(':')) {
    return normalized.split(':').pop();
  }
  return normalized;
}
