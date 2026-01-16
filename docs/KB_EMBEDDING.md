# KB Embedding Guide

This guide explains how the Knowledge Base (KB) embedding system works and how to use it.

## Overview

The KB embedding system converts markdown files in the `kb/` directory into vector embeddings stored in Qdrant Cloud. This enables semantic search across KB entities (people, labs, projects) using natural language queries.

## Architecture

### Components

1. **Embedding Script** (`scripts/Embed/embed-kb.ts`)
   - Processes KB markdown files
   - Generates embeddings using Gemini API
   - Stores in Qdrant Cloud

2. **Vector Store Service** (`lib/services/vector-store-service.ts`)
   - Manages Qdrant Cloud operations
   - Works in all environments (local, Vercel, Railway)
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
   - Stores in Qdrant Cloud collection `kb_documents`
   - Uses idempotent upsert (re-running script updates existing points)

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
- `QDRANT_CLUSTER_ENDPOINT` must be set in `.env.local`
- `QDRANT_API_KEY` must be set in `.env.local`
- `@qdrant/js-client-rest` package installed

**Output**:
- Processes each file and shows chunk count
- Stores embeddings in Qdrant Cloud collection `kb_documents`
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

## Vector Store Architecture

### Qdrant Cloud

The system uses Qdrant Cloud for vector storage:
- **HTTP API**: Works in all environments (local, Vercel, Railway)
- **Managed Service**: No local file system or native modules required
- **Free Tier**: 1GB free forever (perfect for small KBs)
- **Idempotent Operations**: Safe to re-run embedding script
- **Payload Indexes**: Efficient filtering by entity_id, entity_type, file_path

## Troubleshooting

### Common Issues

**Issue**: "Failed to convert JavaScript value to rust type String"
- **Cause**: Metadata contains non-primitive values or conflicts with document ID
- **Solution**: Ensure frontmatter `id` is excluded from metadata (stored as `entity_id`)

**Issue**: Duplicate chunk IDs
- **Cause**: Frontmatter `id` overwriting document IDs
- **Solution**: Fixed in current version - `id` is excluded from metadata

**Issue**: "QDRANT_CLUSTER_ENDPOINT is required" error
- **Cause**: Environment variable not set
- **Solution**: Set `QDRANT_CLUSTER_ENDPOINT` and `QDRANT_API_KEY` in `.env.local`

**Issue**: Embedding API rate limits
- **Cause**: Too many requests to Gemini API
- **Solution**: Script includes 100ms delay between chunks, increase if needed

### Idempotent Upserts

Qdrant's `upsert()` operation is idempotent by design:
- Re-running the embedding script updates existing points by ID
- No duplicates created
- No need to drop/recreate collection
- Safe to run multiple times

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
