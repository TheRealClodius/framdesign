/**
 * Test Vector Search
 *
 * Quick script to test vector search against the embedded KB
 * Usage: npx tsx scripts/Testing/kb/test-search.ts "your search query"
 */

import { GoogleGenAI } from '@google/genai';
import { config } from 'dotenv';
import path from 'path';
import { searchSimilar } from '../../../lib/services/vector-store-service';

// Load environment variables
config({ path: path.join(process.cwd(), '.env.local') });

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
// Note: text-embedding-004 was shut down Jan 14, 2026
const EMBEDDING_MODEL = 'gemini-embedding-001';
const EMBEDDING_DIMENSION = 768;

if (!GEMINI_API_KEY) {
  console.error('❌ GEMINI_API_KEY not found');
  process.exit(1);
}

const genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY, vertexai: false });

async function generateEmbedding(text: string): Promise<number[]> {
  const result = await genAI.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: [text],
    config: { outputDimensionality: EMBEDDING_DIMENSION }
  });

  if (result.embeddings && result.embeddings.length > 0 && result.embeddings[0].values) {
    return result.embeddings[0].values;
  }

  throw new Error('No embedding values returned');
}

async function testSearch(query: string) {
  console.log(`\n🔍 Searching for: "${query}"\n`);

  // Generate embedding for the query
  console.log('📊 Generating query embedding...');
  const queryEmbedding = await generateEmbedding(query);

  // Search for similar documents
  console.log('🔎 Searching vector database...\n');
  const results = await searchSimilar(queryEmbedding, 5, undefined, query);

  console.log(`✅ Found ${results.length} results:\n`);

  results.forEach((result, idx) => {
    console.log(`${idx + 1}. [Score: ${result.score.toFixed(3)}] ${result.metadata.title || result.id}`);
    console.log(`   File: ${result.metadata.file_path}`);
    console.log(`   Preview: ${result.text.substring(0, 150)}...\n`);
  });
}

// Get query from command line args
const query = process.argv.slice(2).join(' ') || 'Who is Andrei?';
testSearch(query).catch(console.error);
