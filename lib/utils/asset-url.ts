/**
 * Unified asset URL handling utilities
 * Consolidates duplicate logic from MarkdownWithMermaid and ChatInterface
 */

const GCS_HOST = 'storage.googleapis.com';
const LOCAL_PREFIX = '/kb-assets/';

export interface AssetInfo {
  blobId: string;
  extension: string;
}

/**
 * Parse an asset URL (GCS or local) to extract blob ID and extension
 */
export function parseAssetUrl(input: string): AssetInfo | null {
  if (!input) return null;

  let filename: string;

  // Handle GCS URLs
  if (input.includes(GCS_HOST)) {
    try {
      const url = new URL(input);
      // Extract full path after /assets/ to preserve subdirectory blob_ids
      // e.g., /bucket/assets/vector/photo.png → vector/photo.png
      const assetsIndex = url.pathname.indexOf('/assets/');
      if (assetsIndex !== -1) {
        filename = decodeURIComponent(url.pathname.slice(assetsIndex + '/assets/'.length));
      } else {
        const pathParts = url.pathname.split('/');
        filename = decodeURIComponent(pathParts[pathParts.length - 1] || '');
      }
    } catch {
      return null;
    }
  }
  // Handle local /kb-assets/ paths
  else if (input.includes('kb-assets')) {
    filename = input.replace(/^\/?(kb-assets\/)?/, '');
  }
  else {
    return null;
  }

  const dotIndex = filename.lastIndexOf('.');
  if (dotIndex === -1) return null;

  return {
    blobId: filename.slice(0, dotIndex),
    extension: filename.slice(dotIndex + 1)
  };
}

/**
 * Normalize an asset path to standard /kb-assets/ format
 */
export function normalizeAssetPath(src: string): string {
  if (!src) return src;
  if (src.startsWith('http://') || src.startsWith('https://')) return src;

  // Remove leading slash and kb-assets prefix, then re-add consistently
  const clean = src.replace(/^\/?(kb-assets\/)?/, '');
  return `${LOCAL_PREFIX}${clean}`;
}

/**
 * Refresh an expired GCS signed URL
 */
export async function refreshAssetUrl(blobId: string, extension: string): Promise<string | null> {
  try {
    const response = await fetch('/api/refresh-asset-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blob_id: blobId, extension })
    });

    if (!response.ok) return null;

    const data = await response.json();
    return data.url || null;
  } catch {
    return null;
  }
}
