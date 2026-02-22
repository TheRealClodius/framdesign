/**
 * Client-side asset resolver
 *
 * Resolves stable /kb-assets/ references to signed GCS URLs at render time.
 * Uses an in-memory cache (30 min TTL) to avoid redundant API calls.
 */

import { parseAssetUrl, refreshAssetUrl } from '@/lib/utils/asset-url';

const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

interface CacheEntry {
  url: string;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

/**
 * Check if a src string is a stable /kb-assets/ reference (not an HTTP URL)
 */
export function isStableAssetRef(src: string): boolean {
  if (!src) return false;
  if (src.startsWith('http://') || src.startsWith('https://')) return false;
  return src.startsWith('/kb-assets/') || src.startsWith('kb-assets/');
}

/**
 * Resolve a stable asset reference to a signed GCS URL.
 *
 * - HTTP/HTTPS URLs → returned as-is (backward compat)
 * - /kb-assets/ paths → parsed, cached, resolved via refreshAssetUrl()
 * - Returns original src on failure (graceful degradation)
 */
export async function resolveAssetSrc(src: string): Promise<string> {
  if (!src) return src;

  // HTTP URLs pass through (backward compat for old messages with signed URLs)
  if (src.startsWith('http://') || src.startsWith('https://')) return src;

  // Only resolve /kb-assets/ references
  if (!isStableAssetRef(src)) return src;

  const parsed = parseAssetUrl(src);
  if (!parsed) return src;

  const cacheKey = `${parsed.blobId}.${parsed.extension}`;

  // Check cache
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.url;
  }

  // Resolve via API
  const signedUrl = await refreshAssetUrl(parsed.blobId, parsed.extension);
  if (!signedUrl) return src;

  // Cache the result
  cache.set(cacheKey, {
    url: signedUrl,
    expiresAt: Date.now() + CACHE_TTL,
  });

  return signedUrl;
}
