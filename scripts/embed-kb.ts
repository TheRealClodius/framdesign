/**
 * KB Embedding Script
 *
 * Reads all markdown files from kb/ directory, generates embeddings using Gemini,
 * and stores them in LanceDB vector database.
 *
 * Usage: npx tsx scripts/embed-kb.ts
 */

import { GoogleGenAI } from '@google/genai';
import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';
import { config } from 'dotenv';
import { upsertDocuments } from '../lib/services/vector-store-service';

// Load environment variables from .env
config({ path: path.join(process.cwd(), '.env') });

// Configuration
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const KB_DIR = path.join(process.cwd(), 'kb');
// Note: text-embedding-004 was shut down Jan 14, 2026
const EMBEDDING_MODEL = 'gemini-embedding-001';
const EMBEDDING_DIMENSION = 768; // Match existing Qdrant collection
const CHUNK_SIZE = 1000; // Characters per chunk
const CHUNK_OVERLAP = 200; // Overlap between chunks

if (!GEMINI_API_KEY) {
  console.error('❌ GEMINI_API_KEY not found in environment variables');
  process.exit(1);
}

// Initialize Gemini client - always use API key for embeddings
// vertexai: false prevents SDK from auto-detecting GOOGLE_APPLICATION_CREDENTIALS
const genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY, vertexai: false });
console.log('ℹ️  Using Google AI Studio (API Key) for embeddings');

/**
 * Recursively find all markdown files in a directory
 */
async function findMarkdownFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await findMarkdownFiles(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Split text into overlapping chunks with word boundary awareness
 * Ensures chunks don't break in the middle of words
 */
function chunkText(text: string, chunkSize: number, overlap: number): string[] {
  const chunks: string[] = [];
  let start = 0;
  let lastEnd = 0; // Track last end position to ensure progress

  while (start < text.length) {
    let end = Math.min(start + chunkSize, text.length);
    
    // If not at the end of text, try to find a word boundary
    if (end < text.length) {
      // Look for the last space, newline, or punctuation within a reasonable range
      const searchStart = Math.max(start, end - 100); // Search back up to 100 chars
      const snippet = text.slice(searchStart, Math.min(end + 50, text.length)); // Look ahead 50 chars too
      
      // Try to find good break points (in order of preference)
      const breakPoints = [
        snippet.lastIndexOf('\n\n'), // Paragraph break
        snippet.lastIndexOf('\n'),   // Line break
        snippet.lastIndexOf('. '),   // Sentence end
        snippet.lastIndexOf('! '),
        snippet.lastIndexOf('? '),
        snippet.lastIndexOf(', '),   // Clause break
        snippet.lastIndexOf(' '),    // Word break
      ];
      
      for (const breakPoint of breakPoints) {
        if (breakPoint > 0 && breakPoint < snippet.length - 10) { // Ensure not too close to edges
          end = searchStart + breakPoint + 1; // +1 to include the break character
          break;
        }
      }
    }
    
    const chunk = text.slice(start, end).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }
    
    // Ensure we're making progress (prevent infinite loop)
    if (end <= lastEnd) {
      // Force progress if we didn't advance
      end = lastEnd + Math.max(100, chunkSize / 2);
    }
    lastEnd = end;
    
    // Move start position, accounting for overlap
    // But ensure we always move forward
    start = Math.max(end - overlap, start + Math.floor(chunkSize / 2));
    
    // If we've reached the end, break
    if (start >= text.length) {
      break;
    }
  }

  return chunks;
}

/**
 * Generate embedding for a text using Gemini
 */
async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const result = await genAI.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: [text],
      config: { outputDimensionality: EMBEDDING_DIMENSION }
    });

    if (result.embeddings && result.embeddings.length > 0 && result.embeddings[0].values) {
      return result.embeddings[0].values;
    }

    throw new Error('No embedding values returned from API');
  } catch (error: any) {
    console.error(`❌ Error generating embedding:`, error.message);
    throw error;
  }
}

/**
 * Process a single markdown file
 */
async function processMarkdownFile(filePath: string): Promise<Array<{
  id: string;
  text: string;
  embedding: number[];
  metadata: Record<string, any>;
}>> {
  const content = await fs.readFile(filePath, 'utf-8');
  const { data: frontmatter, content: body } = matter(content);

  // Get relative path from kb directory
  const relativePath = path.relative(KB_DIR, filePath);
  const fileId = relativePath.replace(/\.md$/, '').replace(/\\/g, '/');

  // Combine frontmatter and body for embedding
  const frontmatterText = Object.entries(frontmatter)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join('\n');

  const fullText = `${frontmatterText}\n\n${body}`.trim();

  // Split into chunks
  const chunks = chunkText(fullText, CHUNK_SIZE, CHUNK_OVERLAP);

  console.log(`📄 Processing ${relativePath} (${chunks.length} chunks)`);

  // Generate embeddings for each chunk
  const documents = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunkText = chunks[i];
    console.log(`   Generating embedding for chunk ${i + 1}/${chunks.length}...`);

    const embedding = await generateEmbedding(chunkText);

    // Flatten metadata - convert arrays and objects to JSON strings
    // This prevents LanceDB schema inference errors
    const flattenedMetadata: Record<string, string | number | boolean> = {
      file_path: relativePath,
      chunk_index: i,
      total_chunks: chunks.length,
      entity_type: frontmatter.type || 'unknown',
      entity_id: frontmatter.id || fileId,
      title: frontmatter.title || path.basename(filePath, '.md'),
    };

    // Add other frontmatter fields, converting complex types to JSON strings
    for (const [key, value] of Object.entries(frontmatter)) {
      if (value !== undefined && value !== null) {
        if (typeof value === 'object') {
          flattenedMetadata[key] = JSON.stringify(value);
        } else {
          flattenedMetadata[key] = value as string | number | boolean;
        }
      }
    }

    documents.push({
      id: chunks.length > 1 ? `${fileId}_chunk_${i}` : fileId,
      text: chunkText,
      embedding,
      metadata: flattenedMetadata,
    });

    // Add delay to avoid rate limiting
    if (i < chunks.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  return documents;
}

/**
 * Main embedding function
 */
async function embedKB() {
  console.log('🚀 Starting KB embedding process...\n');

  // Find all markdown files
  console.log(`📂 Scanning ${KB_DIR} for markdown files...`);
  const markdownFiles = await findMarkdownFiles(KB_DIR);
  console.log(`✅ Found ${markdownFiles.length} markdown files\n`);

  if (markdownFiles.length === 0) {
    console.log('⚠️  No markdown files found in kb/ directory');
    return;
  }

  // Process each file and collect all documents
  const allDocuments = [];
  for (const filePath of markdownFiles) {
    try {
      const documents = await processMarkdownFile(filePath);
      allDocuments.push(...documents);
    } catch (error: any) {
      console.error(`❌ Error processing ${filePath}:`, error.message);
    }
  }

  console.log(`\n📊 Total chunks to embed: ${allDocuments.length}`);

  // Upsert all documents to vector store
  if (allDocuments.length > 0) {
    console.log('\n💾 Storing embeddings in LanceDB...');
    await upsertDocuments(allDocuments);
    console.log('✅ Successfully stored all embeddings!');
  }

  console.log('\n🎉 KB embedding complete!');
  console.log(`\n📈 Summary:`);
  console.log(`   Files processed: ${markdownFiles.length}`);
  console.log(`   Total chunks: ${allDocuments.length}`);
  console.log(`   Vector dimension: ${allDocuments[0]?.embedding?.length || 'N/A'}`);
}

// Run the embedding process
embedKB().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
