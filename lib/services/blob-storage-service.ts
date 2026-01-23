/**
 * Blob Storage Service
 * 
 * Handles Google Cloud Storage operations for assets.
 * Provides ID-based resolution to URLs.
 */

import { Storage } from '@google-cloud/storage';

// Initialize GCS client
// Supports multiple credential methods:
// 1. GOOGLE_APPLICATION_CREDENTIALS (ADC) - automatically used by SDK
// 2. GCS_KEY_FILE - explicit key file path
// 3. GCS_SERVICE_ACCOUNT_KEY - base64 encoded key (for Vercel)
function createStorageClient() {
  const config: {
    projectId?: string;
    keyFilename?: string;
    credentials?: object;
  } = {
    // Use GCS_PROJECT_ID or fall back to VERTEXAI_PROJECT
    projectId: process.env.GCS_PROJECT_ID || process.env.VERTEXAI_PROJECT,
  };

  // Priority 1: Explicit key file (for local dev override)
  if (process.env.GCS_KEY_FILE) {
    config.keyFilename = process.env.GCS_KEY_FILE;
  }

  // Priority 2: Base64 encoded service account key (for Vercel - recommended)
  if (process.env.GCS_SERVICE_ACCOUNT_KEY) {
    try {
      config.credentials = JSON.parse(
        Buffer.from(process.env.GCS_SERVICE_ACCOUNT_KEY, 'base64').toString()
      );
    } catch (error) {
      console.error('Failed to parse GCS_SERVICE_ACCOUNT_KEY:', error);
      throw new Error('Invalid GCS_SERVICE_ACCOUNT_KEY format');
    }
  }

  // Priority 3: GOOGLE_APPLICATION_CREDENTIALS as JSON string (for Vercel)
  // If it's a JSON string, parse it; otherwise SDK will use it as file path (ADC)
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS && !config.credentials && !config.keyFilename) {
    try {
      // Try to parse as JSON string (Vercel stores JSON as string in env vars)
      const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS);
      config.credentials = credentials;
    } catch {
      // Not JSON - it's a file path, SDK will use it via ADC
      // No explicit config needed - SDK handles it automatically
    }
  }

  return new Storage(config);
}

const storage = createStorageClient();
const bucketName = process.env.GCS_BUCKET_NAME || 'framdesign-assets';
const bucket = storage.bucket(bucketName);

// In-memory cache for signed URLs with TTL slightly less than expiration
// Cache key: `${blobId}:${extension}:${expiresInDays}`
// Memory consideration: For long-running servers, this cache can grow indefinitely.
// - Expired entries are cleaned up periodically (every 1 hour)
// - Optional LRU cache with max size can be enabled via URL_CACHE_MAX_SIZE env var
// - For serverless/Vercel, cache clears on restart (acceptable)
const urlCache = new Map<string, { url: string; expiresAt: number; lastAccessed: number }>();

// Optional: Max cache size for LRU eviction (0 = unlimited, suitable for serverless)
const MAX_CACHE_SIZE = parseInt(process.env.URL_CACHE_MAX_SIZE || '0', 10);

// Cleanup interval: 1 hour (cleans expired entries)
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Clean up expired cache entries
 * Runs periodically to prevent memory growth
 */
function cleanupExpiredEntries(): void {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [key, entry] of urlCache.entries()) {
    if (entry.expiresAt <= now) {
      urlCache.delete(key);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    console.log(`[BlobStorage] Cleaned up ${cleaned} expired URL cache entries`);
  }
}

/**
 * Evict least recently used entries if cache exceeds max size
 * Only runs if MAX_CACHE_SIZE > 0
 */
function evictLRUEntries(): void {
  if (MAX_CACHE_SIZE === 0 || urlCache.size <= MAX_CACHE_SIZE) {
    return;
  }
  
  // Sort entries by lastAccessed and remove oldest
  const entries = Array.from(urlCache.entries())
    .sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);
  
  const toRemove = entries.slice(0, urlCache.size - MAX_CACHE_SIZE);
  for (const [key] of toRemove) {
    urlCache.delete(key);
  }
  
  console.log(`[BlobStorage] Evicted ${toRemove.length} LRU cache entries (max size: ${MAX_CACHE_SIZE})`);
}

// Start periodic cleanup (only in Node.js runtime, not in edge runtime)
if (typeof setInterval !== 'undefined') {
  setInterval(cleanupExpiredEntries, CLEANUP_INTERVAL_MS);
  
  // Initial cleanup after 5 minutes (allows cache to warm up)
  setTimeout(cleanupExpiredEntries, 5 * 60 * 1000);
}

/**
 * Resolve blob ID to signed GCS URL
 * Uses signed URLs since public access prevention is enabled
 * Caches URLs to avoid regenerating signed URLs for the same asset
 * @param blobId - Stable identifier (e.g., "andrei-clodius/photo_of_andrei")
 * @param extension - File extension (e.g., "png", "jpeg", "mov")
 * @param expiresInDays - Number of days until expiration (default: 7)
 * @returns Signed URL
 */
export async function resolveBlobUrl(
  blobId: string,
  extension: string,
  expiresInDays: number = 7
): Promise<string> {
  if (!blobId) {
    throw new Error('blob_id is required');
  }

  // Create cache key
  const cacheKey = `${blobId}:${extension}:${expiresInDays}`;
  
  // Check cache - use TTL slightly less than expiration (6.9 days for 7-day expiration)
  const cacheEntry = urlCache.get(cacheKey);
  const now = Date.now();
  const cacheTTL = expiresInDays * 24 * 60 * 60 * 1000 * 0.985; // 98.5% of expiration time
  
  if (cacheEntry && cacheEntry.expiresAt > now) {
    // Update lastAccessed for LRU tracking
    cacheEntry.lastAccessed = now;
    return cacheEntry.url;
  }

  // Generate new signed URL
  const fileName = `assets/${blobId}.${extension}`;
  const file = bucket.file(fileName);

  const [url] = await file.getSignedUrl({
    action: 'read',
    expires: Date.now() + expiresInDays * 24 * 60 * 60 * 1000,
  });

  // Evict LRU entries if cache is full (before adding new entry)
  evictLRUEntries();

  // Cache the URL with expiration slightly less than the signed URL expiration
  urlCache.set(cacheKey, {
    url,
    expiresAt: now + cacheTTL,
    lastAccessed: now,
  });

  return url;
}

/**
 * Generate signed URL for private assets
 * @param blobId - Stable identifier
 * @param extension - File extension
 * @param expiresInDays - Number of days until expiration (default: 7)
 * @returns Signed URL
 * @deprecated Use resolveBlobUrl instead
 */
export async function generateSignedUrl(
  blobId: string,
  extension: string,
  expiresInDays: number = 7
): Promise<string> {
  return resolveBlobUrl(blobId, extension, expiresInDays);
}

/**
 * Upload asset to GCS
 * @param blobId - Stable identifier
 * @param fileBuffer - File contents as Buffer
 * @param contentType - MIME type (e.g., "image/png")
 * @param makePublic - Whether to make file publicly accessible (default: true)
 * @returns Public URL of uploaded file
 */
export async function uploadAsset(
  blobId: string,
  fileBuffer: Buffer,
  contentType: string,
  makePublic: boolean = false // Default to false since we use signed URLs
): Promise<string> {
  const extension = contentType.split('/')[1] || 'png';
  const fileName = `assets/${blobId}.${extension}`;
  const file = bucket.file(fileName);

  await file.save(fileBuffer, {
    metadata: { contentType },
  });

  // Try to make public if requested (may fail if public access prevention is enabled)
  if (makePublic) {
    try {
      await file.makePublic();
    } catch (error) {
      // Ignore public access prevention errors - we'll use signed URLs
      if (error instanceof Error && !error.message?.includes('public access prevention')) {
        throw error;
      }
      // If it's not an Error instance or it's a public access prevention error, ignore it
    }
  }

  // Return signed URL instead of public URL
  return resolveBlobUrl(blobId, extension);
}

/**
 * Check if asset exists in GCS
 * @param blobId - Stable identifier
 * @param extension - File extension
 * @returns True if asset exists, false otherwise
 */
export async function assetExists(blobId: string, extension: string): Promise<boolean> {
  const fileName = `assets/${blobId}.${extension}`;
  const file = bucket.file(fileName);
  const [exists] = await file.exists();
  return exists;
}

/**
 * Fetch asset as Buffer for multimodal processing
 * @param blobId - Stable identifier
 * @param extension - File extension
 * @returns File buffer
 */
export async function fetchAssetBuffer(
  blobId: string,
  extension: string
): Promise<Buffer> {
  if (!blobId) {
    throw new Error('blob_id is required');
  }

  const fileName = `assets/${blobId}.${extension}`;
  const file = bucket.file(fileName);

  const [buffer] = await file.download();
  return buffer;
}

/**
 * Get URL cache statistics (useful for monitoring)
 * @returns Cache statistics including size, max size, and expired entry count
 */
export function getUrlCacheStats(): {
  size: number;
  maxSize: number;
  expiredEntries: number;
  activeEntries: number;
} {
  const now = Date.now();
  let expiredCount = 0;

  for (const entry of urlCache.values()) {
    if (entry.expiresAt <= now) {
      expiredCount++;
    }
  }

  return {
    size: urlCache.size,
    maxSize: MAX_CACHE_SIZE,
    expiredEntries: expiredCount,
    activeEntries: urlCache.size - expiredCount,
  };
}
