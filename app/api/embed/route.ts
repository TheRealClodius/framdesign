/**
 * KB Embed API Route
 *
 * POST /api/embed
 *
 * Triggers re-embedding of KB markdown files and upserts to Qdrant.
 * Protected by EMBED_API_SECRET bearer token.
 *
 * Request body:
 *   - mode: "all" | "entity"
 *   - targets?: string[] (required when mode is "entity", e.g. ["lab:fram_design"])
 *   - includeAssets?: boolean (default: true for "all" mode)
 *
 * Usage:
 *   curl -X POST https://fram.design/api/embed \
 *     -H "Authorization: Bearer <EMBED_API_SECRET>" \
 *     -H "Content-Type: application/json" \
 *     -d '{"mode": "entity", "targets": ["lab:fram_design"]}'
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { embedKBFiles } from '@/lib/services/kb-embed-service';
import { handleServerError } from '@/lib/errors';

// Allow up to 5 minutes for full re-embed (Vercel Pro)
export const maxDuration = 300;

const EmbedRequestSchema = z.object({
  mode: z.enum(['all', 'entity']),
  targets: z.array(z.string()).optional(),
  includeAssets: z.boolean().optional(),
}).refine(
  (data) => data.mode === 'all' || (data.targets && data.targets.length > 0),
  { message: 'targets is required when mode is "entity"' }
);

export async function POST(request: NextRequest) {
  // Auth check
  const secret = process.env.EMBED_API_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: 'EMBED_API_SECRET not configured on server' },
      { status: 500 }
    );
  }

  const authHeader = request.headers.get('authorization');
  if (!authHeader || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const parsed = EmbedRequestSchema.parse(body);

    const result = await embedKBFiles({
      mode: parsed.mode,
      targets: parsed.targets,
      includeAssets: parsed.includeAssets,
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request', details: error.issues },
        { status: 400 }
      );
    }

    console.error('[embed] Error:', error);
    return handleServerError(error);
  }
}
