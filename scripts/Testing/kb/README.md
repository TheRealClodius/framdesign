# KB Testing Scripts

This directory contains scripts for testing Knowledge Base (KB) tools and vector search functionality.

## Scripts

### `test-kb-tools.ts`

Comprehensive test suite for KB tools (`kb_search` and `kb_get`) via the tool registry.

**Usage:**
```bash
npx tsx scripts/Testing/kb/test-kb-tools.ts
```

**Tests:**
1. **kb_search - Simple Query** - Basic semantic search
2. **kb_get - Retrieve Entity** - ID-based retrieval
3. **kb_search - Voice Mode Clamping** - Verifies voice mode limits results to 3
4. **kb_search - Empty Results** - Tests handling of queries with no matches
5. **kb_get - Non-existent Entity** - Tests error handling for missing entities

### `test-search.ts`

Quick script to test vector search directly against the embedded KB.

**Usage:**
```bash
npx tsx scripts/Testing/kb/test-search.ts "your search query"
```

**Example:**
```bash
npx tsx scripts/Testing/kb/test-search.ts "Who worked on Vector Watch?"
```

**Output:**
- Query embedding generation
- Vector search results with scores
- File paths and text previews

### `verify-kb-tools.ts`

Quick verification script that tests basic KB tool functionality.

**Usage:**
```bash
npx tsx scripts/Testing/kb/verify-kb-tools.ts
```

**Verifies:**
- Tool registry loads correctly
- `kb_search` returns results
- `kb_get` retrieves full document content

## Prerequisites

- KB must be embedded (run `npx tsx scripts/Embed/embed-kb.ts`)
- `GEMINI_API_KEY` in `.env.local`
- Tool registry built (`npm run build:tools`)

## Related Documentation

- [KB Embedding](../../Embed/README.md)
- [KB Tools Documentation](../../../tools/kb-search/doc.md)
- [KB Tools Documentation](../../../tools/kb-get/doc.md)
- [Vector Store Service](../../../lib/services/vector-store-service.ts)
