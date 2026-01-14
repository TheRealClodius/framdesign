# KB Embedding Guide

This guide explains how the Knowledge Base (KB) embedding system works and how to use it.

## Overview

The KB embedding system converts markdown files in the `kb/` directory into vector embeddings stored in LanceDB. This enables semantic search across KB entities (people, labs, projects) using natural language queries.

## Architecture

### Components

1. **Embedding Script** (`scripts/Embed/embed-kb.ts`)
   - Processes KB markdown files
   - Generates embeddings using Gemini API
   - Stores in LanceDB

2. **Vector Store Service** (`lib/services/vector-store-service.ts`)
   - Manages LanceDB operations
   - Supports local and API modes
   - Handles search and retrieval

3. **Embedding Service** (`lib/services/embedding-service.ts`)
   - Centralized embedding generation
   - Uses Gemini `text-embedding-004` model
   - Returns 768-dimensional vectors

## Embedding Process

### Step-by-Step

1. **File Discovery**
   - Scans `kb/` directory recursively
   - Finds all `.md` files
   - Excludes `README.md` (documentation only)

2. **Chunking**
   - Splits each file into chunks
   - Chunk size: 1000 characters
   - Overlap: 200 characters
   - Ensures context preservation across boundaries

3. **Embedding Generation**
   - Generates embedding for each chunk
   - Uses Gemini `text-embedding-004` model
   - 768-dimensional vectors
   - Rate limiting: 100ms delay between chunks

4. **Storage**
   - Creates unique ID for each chunk: `{entity_id}_chunk_{index}`
   - Stores in LanceDB table `kb_documents`
   - Table is dropped and recreated on each run (clean schema)

### Document ID Format

Each chunk receives a unique ID based on:
- **Entity ID**: From frontmatter `id` field (e.g., `person:andrei_clodius`)
- **Chunk Index**: 0-based index within the document

**Examples**:
- Single chunk: `project:fitbit_OS_chunk_0`
- Multiple chunks: `lab:fram_design_chunk_0`, `lab:fram_design_chunk_1`, etc.

**Important**: Even single-chunk files get `_chunk_0` suffix to ensure consistency if files are later split.

### Metadata Structure

Each chunk stores:

```typescript
{
  id: string;                    // Unique chunk ID: {entity_id}_chunk_{index}
  vector: number[];              // 768-dim embedding
  text: string;                  // Chunk text content
  
  // Metadata fields:
  file_path: string;              // Relative path from kb/ (e.g., "people/andrei_clodius.md")
  chunk_index: number;            // 0-based chunk index
  total_chunks: number;           // Total chunks for this document
  entity_type: string;            // From frontmatter "type" (person, lab, project)
  entity_id: string;             // From frontmatter "id" (e.g., "person:andrei_clodius")
  title: string;                  // From frontmatter "title"
  
  // All other frontmatter fields (except "id")
  // Complex types (objects/arrays) are JSON stringified
}
```

**Critical Note**: The frontmatter `id` field is stored as `entity_id` in metadata. The document `id` field is reserved for the unique chunk ID. This prevents conflicts when metadata is merged into the row.

## Usage

### Running Embedding

```bash
npx tsx scripts/Embed/embed-kb.ts
```

**Requirements**:
- `GEMINI_API_KEY` must be set in `.env.local`
- `@lancedb/lancedb` package installed
- Node.js environment (LanceDB uses native modules)

**Output**:
- Processes each file and shows chunk count
- Stores embeddings in `.lancedb/kb_documents.lance/`
- Prints summary with total chunks and vector dimension

### Verifying Embedding

```bash
npx tsx scripts/Embed/verify-kb-embedding.ts
```

This script checks:
- ✅ All KB files are embedded
- ✅ Chunks have unique IDs (no duplicates)
- ✅ No orphaned chunks exist
- ⚠️ Reports any missing files or issues

## Vector Store Modes

### Local Mode (Default)

When `VECTOR_SEARCH_API_URL` is not set:
- Direct LanceDB access
- Data stored in `.lancedb/` directory
- Suitable for local development
- Requires Node.js environment

### API Mode (Vercel)

When `VECTOR_SEARCH_API_URL` is set:
- HTTP API calls to vector-search-api service
- Required for serverless environments (Vercel)
- No local file system access needed
- API handles LanceDB operations

## Troubleshooting

### Common Issues

**Issue**: "Failed to convert JavaScript value to rust type String"
- **Cause**: Metadata contains non-primitive values or conflicts with document ID
- **Solution**: Ensure frontmatter `id` is excluded from metadata (stored as `entity_id`)

**Issue**: Duplicate chunk IDs
- **Cause**: Frontmatter `id` overwriting document IDs
- **Solution**: Fixed in current version - `id` is excluded from metadata

**Issue**: "LanceDB not found" error
- **Cause**: Native module not available (e.g., in browser)
- **Solution**: Use API mode or run in Node.js environment

**Issue**: Embedding API rate limits
- **Cause**: Too many requests to Gemini API
- **Solution**: Script includes 100ms delay between chunks, increase if needed

### Schema Conflicts

The vector store service drops and recreates the table on each embedding run. This ensures:
- Clean schema matching current metadata structure
- No conflicts from schema changes
- Consistent data structure

If you need to preserve existing data, modify `upsertDocuments()` to use `mergeInsert()` instead of dropping the table.

## Best Practices

1. **Run embedding after KB changes**: Always re-embed after adding/modifying KB files
2. **Verify after embedding**: Use verification script to catch issues early
3. **Keep frontmatter consistent**: Use same field names across entities
4. **Avoid large files**: Very large files create many chunks (consider splitting)
5. **Monitor API usage**: Embedding uses Gemini API (has rate limits and costs)

## Related Tools

- **kb_search**: Semantic search over embedded KB
- **kb_get**: Direct retrieval by entity ID
- **verify-kb-embedding.ts**: Verification script
- **test-kb-tools.ts**: Integration tests

## See Also

- [KB README](kb/README.md) - KB structure and schema
- [Vector Store Service](../lib/services/vector-store-service.ts) - Implementation details
- [Embedding Service](../lib/services/embedding-service.ts) - Embedding generation
