/**
 * KB Embedding Script (CLI wrapper)
 *
 * Reads all markdown files from kb/ directory, generates embeddings using Gemini,
 * and stores them in Qdrant Cloud vector database.
 *
 * This is a thin CLI wrapper around lib/services/kb-embed-service.ts.
 * The core logic is shared with the /api/embed API route.
 *
 * ⚠️ CRITICAL RULES FOR MODIFICATIONS:
 *
 * 1. Document ID Format:
 *    - ALWAYS use: {entity_id}_chunk_{index}
 *    - Even single-chunk files get _chunk_0 suffix
 *
 * 2. Frontmatter ID Handling:
 *    - Frontmatter 'id' MUST be stored as 'entity_id'
 *    - Frontmatter 'id' MUST be excluded from metadata
 *    - Never add frontmatter 'id' as 'id' to metadata
 *
 * 3. Metadata ID Exclusion:
 *    - vector-store-service.ts MUST skip 'id' when merging metadata
 *    - This prevents overwriting document IDs
 *
 * 4. Idempotent Upserts:
 *    - Qdrant upsert() is idempotent - re-running script updates existing points
 *    - No need to drop/recreate collection
 *
 * See README.md and EMBEDDING_CHECKLIST.md in this directory for details.
 *
 * Usage: npx tsx scripts/Embed/embed-kb.ts
 *
 * Requirements:
 * - GEMINI_API_KEY in .env
 * - QDRANT_CLUSTER_ENDPOINT in .env
 * - QDRANT_API_KEY in .env
 * - @qdrant/js-client-rest installed
 */

// Load environment variables from .env BEFORE any other imports
// This ensures env vars are available when vector-store-service is imported
import { config } from 'dotenv';
import path from 'path';
// Use override: true to ensure env vars override any existing values
config({ path: path.join(process.cwd(), '.env'), override: true });

if (!process.env.GEMINI_API_KEY) {
  console.error('❌ GEMINI_API_KEY not found in environment variables');
  process.exit(1);
}

console.log('ℹ️  Using Google AI Studio (API Key) for embeddings');

async function main() {
  // Dynamic import to ensure env vars are loaded before service reads them
  const { embedKBFiles } = await import('../../lib/services/kb-embed-service');

  console.log('🚀 Starting KB embedding process...\n');

  const result = await embedKBFiles({
    mode: 'all',
    includeAssets: true,
  });

  // Log results
  if (result.errors.length > 0) {
    for (const err of result.errors) {
      console.error(`❌ Error processing ${err.file}:`, err.error);
    }
  }

  console.log('\n🎉 KB embedding complete!');
  console.log(`\n📈 Summary:`);
  console.log(`   Files processed: ${result.filesProcessed}`);
  console.log(`   Chunks generated: ${result.chunksGenerated}`);
  console.log(`   Chunks upserted: ${result.chunksUpserted}`);
  console.log(`   Errors: ${result.errors.length}`);
  console.log(`   Duration: ${(result.durationMs / 1000).toFixed(1)}s`);
}

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
