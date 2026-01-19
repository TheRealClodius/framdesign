/**
 * API endpoint to refresh expired signed URLs for GCS assets
 * Accepts blob_id and extension, returns a fresh signed URL
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveBlobUrl } from '@/lib/services/blob-storage-service';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { blob_id, extension } = body;

    if (!blob_id || !extension) {
      return NextResponse.json(
        { error: 'blob_id and extension are required' },
        { status: 400 }
      );
    }

    // Generate a fresh signed URL (default 7 days expiration)
    const freshUrl = await resolveBlobUrl(blob_id, extension);

    return NextResponse.json({
      url: freshUrl,
      blob_id,
      extension,
    });
  } catch (error) {
    console.error('[refresh-asset-url] Error refreshing URL:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to refresh URL' },
      { status: 500 }
    );
  }
}
