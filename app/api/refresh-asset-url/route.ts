/**
 * API endpoint to refresh expired signed URLs for GCS assets
 * Accepts blob_id and extension, returns a fresh signed URL
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveBlobUrlSafe } from '@/lib/services/blob-storage-service';
import { checkRateLimit } from '@/lib/services/rate-limit-service';
import { getClientIpFromHeaders } from '@/lib/utils/budget-key';
import { isAllowedAssetExtension, isValidBlobId } from '@/lib/utils/card-asset';

const WINDOW_MS = 60_000;
// One page load signs ~10 card assets plus suggestion previews and inline images;
// leave room for reloads and browsing while still bounding scripted abuse.
const MAX_PER_WINDOW = 300;

export async function POST(request: NextRequest) {
  const limit = checkRateLimit('refresh_asset_url', getClientIpFromHeaders(request.headers), WINDOW_MS, MAX_PER_WINDOW);
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } }
    );
  }

  try {
    const body = await request.json().catch(() => null);
    const blobId: unknown = body?.blob_id;
    const extension: unknown = body?.extension;

    // Only KB-shaped asset paths with a known media extension can be signed
    if (!isValidBlobId(blobId) || !isAllowedAssetExtension(extension)) {
      return NextResponse.json({ error: 'Invalid blob_id or extension' }, { status: 400 });
    }

    const ext = extension.toLowerCase();
    const { url, exists } = await resolveBlobUrlSafe(blobId, ext);
    if (!exists) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }

    return NextResponse.json({ url, blob_id: blobId, extension: ext });
  } catch (error) {
    console.error('[refresh-asset-url] Error refreshing URL:', error);
    return NextResponse.json({ error: 'Failed to refresh URL' }, { status: 500 });
  }
}
