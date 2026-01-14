/**
 * KB Embedding Verification Script
 *
 * Checks if KB documents are embedded and verifies content correctness
 *
 * Usage: npx tsx scripts/Embed/verify-kb-embedding.ts
 */

import fs from 'fs/promises';
import path from 'path';
import { config } from 'dotenv';
import { getAllDocumentIds, hasDocuments } from '../../lib/services/vector-store-service';

// Load environment variables
config({ path: path.join(process.cwd(), '.env.local') });

const KB_DIR = path.join(process.cwd(), 'kb');

/**
 * Recursively find all markdown files in kb directory (excluding README.md)
 */
async function findKBMarkdownFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await findKBMarkdownFiles(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'README.md') {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Extract file ID from path (matches embed-kb.ts logic)
 * Note: The actual embedded IDs use frontmatter.id format (e.g., "person:andrei_clodius")
 * but we'll check both formats
 */
function getFileId(filePath: string): string {
  const relativePath = path.relative(KB_DIR, filePath);
  return relativePath.replace(/\.md$/, '').replace(/\\/g, '/');
}

/**
 * Get entity ID from frontmatter (the format actually used in embeddings)
 */
async function getEntityId(filePath: string): Promise<string | null> {
  try {
    const matter = await import('gray-matter');
    const content = await fs.readFile(filePath, 'utf-8');
    const { data: frontmatter } = matter.default(content);
    return frontmatter.id || null;
  } catch {
    return null;
  }
}

/**
 * Main verification function
 */
async function verifyKBEmbedding() {
  console.log('🔍 Verifying KB embedding status...\n');

  // Check if vector store has documents
  const hasDocs = await hasDocuments();
  if (!hasDocs) {
    console.log('❌ Vector store is empty - no documents embedded');
    console.log('💡 Run: npx tsx scripts/Embed/embed-kb.ts');
    return;
  }

  // Get all embedded document IDs
  const embeddedIds = await getAllDocumentIds();
  console.log(`✅ Vector store contains ${embeddedIds.length} document chunks\n`);

  // Find all KB markdown files
  const kbFiles = await findKBMarkdownFiles(KB_DIR);
  console.log(`📂 Found ${kbFiles.length} KB markdown files:\n`);

  // Check each file
  const fileStatus: Array<{ file: string; id: string; entityId: string | null; embedded: boolean; chunks: number; hasUniqueChunkIds: boolean }> = [];

  for (const filePath of kbFiles) {
    const fileId = getFileId(filePath);
    const entityId = await getEntityId(filePath);
    const relativePath = path.relative(KB_DIR, filePath);

    // Count chunks for this file - check both fileId format and entityId format
    // Note: Current embeddings use entityId (from frontmatter) as the base ID
    const baseId = entityId || fileId;
    const fileChunks = embeddedIds.filter(id => {
      // Check if ID matches base ID or is a chunk of it
      return id === baseId || id.startsWith(`${baseId}_chunk_`);
    });

    // Check if chunks have unique IDs (they should have _chunk_X suffix if multiple chunks)
    const uniqueChunkIds = new Set(fileChunks);
    const hasUniqueChunkIds = fileChunks.length <= 1 || uniqueChunkIds.size === fileChunks.length;

    const isEmbedded = fileChunks.length > 0;
    fileStatus.push({
      file: relativePath,
      id: fileId,
      entityId,
      embedded: isEmbedded,
      chunks: fileChunks.length,
      hasUniqueChunkIds,
    });

    const status = isEmbedded ? '✅' : '❌';
    const chunkStatus = hasUniqueChunkIds ? '✅' : '⚠️';
    console.log(`   ${status} ${relativePath}`);
    if (isEmbedded) {
      console.log(`      Entity ID: ${entityId || 'N/A'}`);
      console.log(`      File ID: ${fileId}`);
      console.log(`      Chunks: ${fileChunks.length}`);
      console.log(`      ${chunkStatus} Unique chunk IDs: ${hasUniqueChunkIds ? 'Yes' : 'No'}`);
      if (fileChunks.length > 0) {
        const sampleIds = Array.from(uniqueChunkIds).slice(0, 3);
        console.log(`      Sample IDs: ${sampleIds.join(', ')}${fileChunks.length > 3 ? '...' : ''}`);
      }
    }
    console.log();
  }

  // Summary
  const embeddedFiles = fileStatus.filter(f => f.embedded);
  const missingFiles = fileStatus.filter(f => !f.embedded);
  const filesWithDuplicateIds = fileStatus.filter(f => f.embedded && !f.hasUniqueChunkIds);

  console.log('\n📊 Summary:');
  console.log(`   Total KB files: ${kbFiles.length}`);
  console.log(`   Embedded files: ${embeddedFiles.length}`);
  console.log(`   Missing files: ${missingFiles.length}`);
  console.log(`   Files with duplicate chunk IDs: ${filesWithDuplicateIds.length}`);
  console.log(`   Total chunks: ${embeddedIds.length}`);

  if (missingFiles.length > 0) {
    console.log('\n⚠️  Missing files:');
    missingFiles.forEach(f => {
      console.log(`   - ${f.file} (Entity ID: ${f.entityId || f.id})`);
    });
    console.log('\n💡 Run: npx tsx scripts/Embed/embed-kb.ts');
  }

  if (filesWithDuplicateIds.length > 0) {
    console.log('\n⚠️  Files with duplicate chunk IDs (BUG):');
    filesWithDuplicateIds.forEach(f => {
      console.log(`   - ${f.file}: ${f.chunks} chunks all share the same ID`);
      console.log(`     Expected: ${f.entityId || f.id}_chunk_0, ${f.entityId || f.id}_chunk_1, ...`);
      console.log(`     Actual: All chunks use ID "${f.entityId || f.id}"`);
    });
    console.log('\n💡 This is a bug - chunks should have unique IDs. Re-run: npx tsx scripts/Embed/embed-kb.ts');
  }

  if (missingFiles.length === 0 && filesWithDuplicateIds.length === 0) {
    console.log('\n✅ All KB files are embedded correctly!');
  }

  // Check for orphaned chunks (chunks in vector store that don't match any KB file)
  const orphanedIds: string[] = [];
  for (const id of embeddedIds) {
    let matched = false;
    for (const filePath of kbFiles) {
      const fileId = getFileId(filePath);
      const entityId = await getEntityId(filePath);
      const baseId = entityId || fileId;
      
      if (id === baseId || id.startsWith(`${baseId}_chunk_`) || id.startsWith(`${fileId}_chunk_`)) {
        matched = true;
        break;
      }
    }
    if (!matched) {
      orphanedIds.push(id);
    }
  }

  if (orphanedIds.length > 0) {
    console.log(`\n⚠️  Found ${orphanedIds.length} orphaned chunks in vector store:`);
    orphanedIds.slice(0, 10).forEach(id => console.log(`   - ${id}`));
    if (orphanedIds.length > 10) {
      console.log(`   ... and ${orphanedIds.length - 10} more`);
    }
  }
}

// Run verification
verifyKBEmbedding().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
