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

/**
 * Resolve blob ID to signed GCS URL
 * Uses signed URLs since public access prevention is enabled
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

  const fileName = `assets/${blobId}.${extension}`;
  const file = bucket.file(fileName);

  const [url] = await file.getSignedUrl({
    action: 'read',
    expires: Date.now() + expiresInDays * 24 * 60 * 60 * 1000,
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
      if (!error.message?.includes('public access prevention')) {
        throw error;
      }
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
