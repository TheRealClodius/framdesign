/**
 * KB Embed Service
 *
 * Core embedding logic extracted from scripts/Embed/embed-kb.ts.
 * Used by both the CLI script and the /api/embed API route.
 *
 * Process:
 * 1. Scans kb/ directory for .md files (excludes README.md)
 * 2. Splits each file into chunks (1000 chars, 200 char overlap)
 * 3. Generates embeddings via Gemini gemini-embedding-001 model (768 dimensions)
 * 4. Upserts to Qdrant with unique chunk IDs: {entity_id}_chunk_{index}
 *
 * ⚠️ CRITICAL RULES:
 * - Document ID format: always {entity_id}_chunk_{index}
 * - Frontmatter 'id' stored as 'entity_id', never as 'id' in metadata
 * - See scripts/Embed/README.md and EMBEDDING_CHECKLIST.md for details
 */

import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';
import { generateEmbedding } from '@/lib/services/embedding-service';
import { upsertDocuments } from '@/lib/services/vector-store-service';

// Configuration
const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;
const RATE_LIMIT_DELAY_MS = 100;

// --- Types ---

export interface EmbedDocument {
  id: string;
  text: string;
  embedding: number[];
  metadata: Record<string, string | number | boolean | string[]>;
}

export interface EmbedOptions {
  /** 'all' re-embeds every KB file; 'entity' filters by entity IDs */
  mode: 'all' | 'entity';
  /** Entity IDs to re-embed when mode is 'entity' (e.g. ['lab:fram_design']) */
  targets?: string[];
  /** Whether to include assets from manifest.json (default: true for 'all') */
  includeAssets?: boolean;
}

export interface EmbedResult {
  filesProcessed: number;
  chunksGenerated: number;
  chunksUpserted: number;
  errors: Array<{ file: string; error: string }>;
  durationMs: number;
}

// --- Core functions ---

/**
 * Recursively find all markdown files in a directory (excludes README.md)
 */
export async function findMarkdownFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await findMarkdownFiles(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'README.md') {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Split text into overlapping chunks with word boundary awareness
 */
export function chunkText(text: string, chunkSize: number = CHUNK_SIZE, overlap: number = CHUNK_OVERLAP): string[] {
  const chunks: string[] = [];
  let start = 0;
  let lastEnd = 0;

  while (start < text.length) {
    let end = Math.min(start + chunkSize, text.length);

    if (end < text.length) {
      const searchStart = Math.max(start, end - 100);
      const snippet = text.slice(searchStart, Math.min(end + 50, text.length));

      const breakPoints = [
        snippet.lastIndexOf('\n\n'),
        snippet.lastIndexOf('\n'),
        snippet.lastIndexOf('. '),
        snippet.lastIndexOf('! '),
        snippet.lastIndexOf('? '),
        snippet.lastIndexOf(', '),
        snippet.lastIndexOf(' '),
      ];

      for (const breakPoint of breakPoints) {
        if (breakPoint > 0 && breakPoint < snippet.length - 10) {
          end = searchStart + breakPoint + 1;
          break;
        }
      }
    }

    const chunk = text.slice(start, end).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }

    if (end <= lastEnd) {
      end = lastEnd + Math.max(100, chunkSize / 2);
    }
    lastEnd = end;

    start = Math.max(end - overlap, start + Math.floor(chunkSize / 2));

    if (start >= text.length) {
      break;
    }
  }

  return chunks;
}

/**
 * Process a single markdown file into embeddable documents
 */
export async function processMarkdownFile(filePath: string, kbDir: string): Promise<EmbedDocument[]> {
  const content = await fs.readFile(filePath, 'utf-8');
  const { data: frontmatter, content: body } = matter(content);

  const relativePath = path.relative(kbDir, filePath);
  const fileId = relativePath.replace(/\.md$/, '').replace(/\\/g, '/');
  const baseId = frontmatter.id || fileId;

  // Combine frontmatter and body for embedding
  const frontmatterText = Object.entries(frontmatter)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join('\n');
  const fullText = `${frontmatterText}\n\n${body}`.trim();

  const chunks = chunkText(fullText);

  const documents: EmbedDocument[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunkContent = chunks[i];
    const embedding = await generateEmbedding(chunkContent);

    // Flatten metadata
    const flattenedMetadata: Record<string, string | number | boolean> = {
      file_path: relativePath,
      chunk_index: i,
      total_chunks: chunks.length,
      entity_type: frontmatter.type || 'unknown',
      entity_id: frontmatter.id || fileId,
      title: frontmatter.title || path.basename(filePath, '.md'),
    };

    // Add other frontmatter fields (CRITICAL: skip 'id' — stored as 'entity_id')
    for (const [key, value] of Object.entries(frontmatter)) {
      if (key === 'id') continue;
      if (value !== undefined && value !== null) {
        if (typeof value === 'object') {
          flattenedMetadata[key] = JSON.stringify(value);
        } else {
          flattenedMetadata[key] = value as string | number | boolean;
        }
      }
    }

    // Chunk ID: always {entity_id}_chunk_{index}
    const documentId = `${baseId}_chunk_${i}`;

    documents.push({
      id: documentId,
      text: chunkContent,
      embedding,
      metadata: flattenedMetadata,
    });

    // Rate limit delay between chunks
    if (i < chunks.length - 1) {
      await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY_MS));
    }
  }

  return documents;
}

/**
 * Process assets from manifest.json into embeddable documents
 */
export async function processAssetManifest(manifestPath: string): Promise<EmbedDocument[]> {
  const documents: EmbedDocument[] = [];

  try {
    await fs.access(manifestPath);
  } catch {
    return documents;
  }

  const manifestContent = await fs.readFile(manifestPath, 'utf-8');
  const manifest = JSON.parse(manifestContent);

  if (!manifest.assets || !Array.isArray(manifest.assets)) {
    return documents;
  }

  for (const asset of manifest.assets) {
    if (!asset.id || !asset.description) continue;

    const tagsText = asset.tags ? asset.tags.join(', ') : '';
    const relatedText = asset.related_entities
      ? asset.related_entities.map((e: string) => `related to ${e.replace(':', ' ').replace('_', ' ')}`).join(', ')
      : '';
    const embeddingText = [
      asset.title || '',
      asset.description,
      tagsText,
      relatedText
    ].filter(Boolean).join('\n');

    const embedding = await generateEmbedding(embeddingText);

    const flattenedMetadata: Record<string, string | number | boolean | string[]> = {
      entity_type: asset.entity_type || 'photo',
      entity_id: asset.id,
      title: asset.title || asset.id,
      path: asset.path,
      caption: asset.caption || '',
    };

    if (asset.blob_id) flattenedMetadata.blob_id = asset.blob_id;
    if (asset.file_extension) flattenedMetadata.file_extension = asset.file_extension;
    if (asset.storage_provider) flattenedMetadata.storage_provider = asset.storage_provider;
    if (asset.tags) flattenedMetadata.tags = JSON.stringify(asset.tags);
    if (asset.related_entities) flattenedMetadata.related_entities = asset.related_entities;

    if (asset.metadata) {
      for (const [key, value] of Object.entries(asset.metadata)) {
        if (value !== undefined && value !== null) {
          if (typeof value === 'object') {
            flattenedMetadata[key] = JSON.stringify(value);
          } else {
            flattenedMetadata[key] = value as string | number | boolean;
          }
        }
      }
    }

    const documentId = `${asset.id}_chunk_0`;
    documents.push({
      id: documentId,
      text: embeddingText,
      embedding,
      metadata: flattenedMetadata,
    });

    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY_MS));
  }

  return documents;
}

/**
 * Validate documents before upserting (checks for duplicates and ID format)
 */
function validateDocuments(documents: EmbedDocument[]): void {
  const idSet = new Set<string>();
  const duplicates: string[] = [];

  for (const doc of documents) {
    if (idSet.has(doc.id)) {
      duplicates.push(doc.id);
    }
    idSet.add(doc.id);

    if ('id' in doc.metadata) {
      throw new Error(
        `Metadata contains 'id' field for document "${doc.id}". ` +
        `Frontmatter 'id' must be stored as 'entity_id'.`
      );
    }
  }

  if (duplicates.length > 0) {
    throw new Error(
      `Found ${duplicates.length} duplicate document IDs: ${[...new Set(duplicates)].join(', ')}`
    );
  }
}

/**
 * Main orchestrator: embed KB files and upsert to Qdrant
 */
export async function embedKBFiles(options: EmbedOptions): Promise<EmbedResult> {
  const start = Date.now();
  const kbDir = path.join(process.cwd(), 'kb');
  const manifestPath = path.join(kbDir, 'assets', 'manifest.json');

  const result: EmbedResult = {
    filesProcessed: 0,
    chunksGenerated: 0,
    chunksUpserted: 0,
    errors: [],
    durationMs: 0,
  };

  // Find markdown files
  let markdownFiles = await findMarkdownFiles(kbDir);

  // Filter by entity ID if selective mode
  if (options.mode === 'entity' && options.targets && options.targets.length > 0) {
    const targetSet = new Set(options.targets);
    const filtered: string[] = [];

    for (const filePath of markdownFiles) {
      const content = await fs.readFile(filePath, 'utf-8');
      const { data: frontmatter } = matter(content);
      if (frontmatter.id && targetSet.has(frontmatter.id)) {
        filtered.push(filePath);
      }
    }

    markdownFiles = filtered;
  }

  if (markdownFiles.length === 0 && options.mode === 'entity') {
    throw new Error(`No KB files found matching targets: ${options.targets?.join(', ')}`);
  }

  // Process markdown files
  const allDocuments: EmbedDocument[] = [];
  for (const filePath of markdownFiles) {
    try {
      const documents = await processMarkdownFile(filePath, kbDir);
      allDocuments.push(...documents);
      result.filesProcessed++;
    } catch (error: unknown) {
      result.errors.push({
        file: path.relative(kbDir, filePath),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Process assets (only for 'all' mode or when explicitly requested)
  const shouldIncludeAssets = options.includeAssets ?? (options.mode === 'all');
  if (shouldIncludeAssets) {
    try {
      const assetDocuments = await processAssetManifest(manifestPath);
      allDocuments.push(...assetDocuments);
    } catch (error: unknown) {
      result.errors.push({ file: 'assets/manifest.json', error: error instanceof Error ? error.message : String(error) });
    }
  }

  result.chunksGenerated = allDocuments.length;

  // Validate and upsert
  if (allDocuments.length > 0) {
    validateDocuments(allDocuments);
    await upsertDocuments(allDocuments);
    result.chunksUpserted = allDocuments.length;
  }

  result.durationMs = Date.now() - start;
  return result;
}
