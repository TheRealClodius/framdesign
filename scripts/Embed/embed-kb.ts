/**
 * KB Embedding Script
 *
 * Reads all markdown files from kb/ directory, generates embeddings using Gemini,
 * and stores them in LanceDB vector database.
 *
 * Process:
 * 1. Scans kb/ directory for .md files (excludes README.md)
 * 2. Splits each file into chunks (1000 chars, 200 char overlap)
 * 3. Generates embeddings via Gemini text-embedding-004 model
 * 4. Stores in LanceDB with unique chunk IDs: {entity_id}_chunk_{index}
 *
 * ⚠️ CRITICAL RULES FOR MODIFICATIONS:
 * 
 * 1. Document ID Format:
 *    - ALWAYS use: {entity_id}_chunk_{index}
 *    - Even single-chunk files get _chunk_0 suffix
 *    - See line 171 for implementation
 * 
 * 2. Frontmatter ID Handling:
 *    - Frontmatter 'id' MUST be stored as 'entity_id' (line 155)
 *    - Frontmatter 'id' MUST be excluded from metadata (line 162)
 *    - Never add frontmatter 'id' as 'id' to metadata
 * 
 * 3. Metadata ID Exclusion:
 *    - vector-store-service.ts MUST skip 'id' when merging metadata
 *    - See vector-store-service.ts line 122
 *    - This prevents overwriting document IDs
 * 
 * 4. Table Recreation:
 *    - Table is dropped/recreated on each run (clean schema)
 *    - See vector-store-service.ts line 138
 * 
 * See README.md and EMBEDDING_CHECKLIST.md in this directory for details.
 *
 * Usage: npx tsx scripts/Embed/embed-kb.ts
 *
 * Requirements:
 * - GEMINI_API_KEY in .env.local
 * - @lancedb/lancedb installed
 * - Node.js environment (native modules)
 */

import { GoogleGenAI } from '@google/genai';
import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';
import { config } from 'dotenv';
import { upsertDocuments } from '../../lib/services/vector-store-service';

// Load environment variables from .env.local
config({ path: path.join(process.cwd(), '.env.local') });

// Configuration
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const KB_DIR = path.join(process.cwd(), 'kb');
const EMBEDDING_MODEL = 'text-embedding-004'; // Gemini's latest embedding model
const CHUNK_SIZE = 1000; // Characters per chunk
const CHUNK_OVERLAP = 200; // Overlap between chunks

if (!GEMINI_API_KEY) {
  console.error('❌ GEMINI_API_KEY not found in environment variables');
  process.exit(1);
}

// Initialize Gemini client
const genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

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
    } else if (entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'README.md') {
      // Exclude README.md as it's documentation, not KB content
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Split text into overlapping chunks
 */
function chunkText(text: string, chunkSize: number, overlap: number): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    start += chunkSize - overlap;
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
  
  // Use frontmatter.id (entity ID) as the base ID if available, otherwise use fileId
  // This matches the format used in KB files (e.g., "person:andrei_clodius")
  const baseId = frontmatter.id || fileId;

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
    // 
    // ⚠️ CRITICAL: Exclude 'id' field as it conflicts with document ID
    // Frontmatter 'id' is already stored as 'entity_id' above (line 155)
    // If we add it as 'id', it will overwrite the unique chunk ID when metadata is merged
    // This causes all chunks from the same file to have duplicate IDs
    // See vector-store-service.ts line 122 for the corresponding exclusion
    for (const [key, value] of Object.entries(frontmatter)) {
      if (key === 'id') continue; // Skip 'id' - it's already stored as entity_id
      if (value !== undefined && value !== null) {
        if (typeof value === 'object') {
          flattenedMetadata[key] = JSON.stringify(value);
        } else {
          flattenedMetadata[key] = value as string | number | boolean;
        }
      }
    }

    // Create unique ID for each chunk
    // 
    // ⚠️ CRITICAL: Always append chunk index to ensure uniqueness
    // Format: {entity_id}_chunk_{index}
    // Even single-chunk files get _chunk_0 suffix for consistency
    // This prevents duplicate IDs when multiple chunks exist
    // Example: lab:fram_design_chunk_0, lab:fram_design_chunk_1, etc.
    const documentId = `${baseId}_chunk_${i}`;

    documents.push({
      id: documentId,
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

  // Validate document IDs before storing
  if (allDocuments.length > 0) {
    const idSet = new Set<string>();
    const duplicates: string[] = [];
    
    for (const doc of allDocuments) {
      if (idSet.has(doc.id)) {
        duplicates.push(doc.id);
      }
      idSet.add(doc.id);
      
      // Validate ID format
      if (!doc.id.includes('_chunk_')) {
        console.warn(`⚠️  Warning: Document ID "${doc.id}" doesn't follow chunk format. Expected: {entity_id}_chunk_{index}`);
      }
      
      // Validate metadata doesn't contain 'id' field
      if (doc.metadata && 'id' in doc.metadata) {
        throw new Error(
          `❌ CRITICAL ERROR: Metadata contains 'id' field for document "${doc.id}". ` +
          `This will overwrite the document ID. Frontmatter 'id' must be stored as 'entity_id'. ` +
          `See scripts/Embed/README.md for details.`
        );
      }
    }
    
    if (duplicates.length > 0) {
      throw new Error(
        `❌ CRITICAL ERROR: Found ${duplicates.length} duplicate document IDs: ${[...new Set(duplicates)].join(', ')}. ` +
        `Each chunk must have a unique ID. See scripts/Embed/README.md for correct ID format.`
      );
    }
    
    console.log(`✅ Validation passed: All ${allDocuments.length} chunks have unique IDs`);
  }

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
