# KB Embedding Scripts

This directory contains scripts for embedding Knowledge Base (KB) documents into a vector store for semantic search.

## Files

- **`embed-kb.ts`** - Main embedding script that processes KB markdown files
- **`verify-kb-embedding.ts`** - Verification script to check embedding status
- **`EMBEDDING_CHECKLIST.md`** - Checklist for modifying the embedding process

## Quick Start

### Embed KB Documents
```bash
npx tsx scripts/Embed/embed-kb.ts
```

### Verify Embedding
```bash
npx tsx scripts/Embed/verify-kb-embedding.ts
```

## Requirements

- `GEMINI_API_KEY` in `.env.local`
- `QDRANT_CLUSTER_ENDPOINT` in `.env.local`
- `QDRANT_API_KEY` in `.env.local`
- `@qdrant/js-client-rest` installed

## ⚠️ CRITICAL NOTES FOR FUTURE MODIFICATIONS

When modifying the embedding script or vector store service, **MUST** follow these rules:

### 1. Document ID Format
- **ALWAYS** use format: `{entity_id}_chunk_{index}` for chunk IDs
- Even single-chunk files get `_chunk_0` suffix
- Example: `lab:fram_design_chunk_0`, `person:andrei_clodius_chunk_1`

### 2. Frontmatter `id` Field Handling
- **NEVER** add frontmatter `id` to metadata as `id`
- Frontmatter `id` MUST be stored as `entity_id` in metadata
- This prevents overwriting the document's unique chunk ID
- See line 185 in `embed-kb.ts`: `if (key === 'id') continue;`

### 3. Metadata ID Exclusion
- **ALWAYS** skip `id` field when merging metadata into Qdrant payloads
- See `lib/services/vector-store-service.ts` for metadata merge logic
- This is critical - failing to do this causes duplicate chunk IDs

### 4. Table Recreation
- Table is dropped and recreated on each embedding run
- This ensures clean schema and prevents conflicts
- Do NOT change to `mergeInsert` without understanding schema implications

### 5. File Exclusion
- `README.md` is excluded from embedding (documentation only)
- See line 80 in `embed-kb.ts`: `entry.name !== 'README.md'`

## Common Mistakes to Avoid

❌ **DON'T**: Add frontmatter `id` to metadata
```typescript
// WRONG - this overwrites document ID
flattenedMetadata.id = frontmatter.id;
```

✅ **DO**: Store as `entity_id`
```typescript
// CORRECT
flattenedMetadata.entity_id = frontmatter.id;
```

❌ **DON'T**: Use entity ID directly as document ID
```typescript
// WRONG - causes duplicate IDs for multiple chunks
id: baseId
```

✅ **DO**: Always append chunk index
```typescript
// CORRECT
id: `${baseId}_chunk_${i}`
```

❌ **DON'T**: Skip ID exclusion in metadata merge
```typescript
// WRONG - metadata.id overwrites document.id
row[key] = value; // if key === 'id'
```

✅ **DO**: Always exclude `id` from metadata
```typescript
// CORRECT
if (key === 'id') continue;
```

## Verification

After any changes, run:
```bash
npx tsx scripts/Embed/verify-kb-embedding.ts
```

This will catch:
- Duplicate chunk IDs
- Missing files
- Orphaned chunks

## Related Files

- `lib/services/vector-store-service.ts` - Qdrant operations
- `lib/services/embedding-service.ts` - Embedding generation
- `docs/KB_EMBEDDING.md` - Comprehensive guide
- `kb/README.md` - KB structure and schema

## Process Overview

1. **Scans** `kb/` directory for `.md` files (excludes `README.md`)
2. **Splits** each file into chunks (1000 chars, 200 char overlap)
3. **Generates** embeddings via Gemini `text-embedding-004` model (768 dimensions)
4. **Stores** in Qdrant Cloud with unique chunk IDs: `{entity_id}_chunk_{index}`

## See Also

- [Embedding Checklist](./EMBEDDING_CHECKLIST.md) - Detailed checklist for modifications
- [KB Embedding Guide](../../docs/KB_EMBEDDING.md) - Comprehensive documentation
- [KB README](../../kb/README.md) - KB structure and schema
