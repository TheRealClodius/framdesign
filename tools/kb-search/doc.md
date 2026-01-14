# kb_search

## Summary
Semantic search over the knowledge base (KB). Searches across entities (people, labs, projects) using natural language queries and vector embeddings. Returns ranked results with relevance scores and source citations.

## Preconditions
- KB must be initialized with embedded documents
- Query must be non-empty (3-500 chars)
- GEMINI_API_KEY must be configured for embedding generation
- Vector store service must be operational

## Postconditions

**Success Case:**
- Query embedding generated via Gemini API
- Vector search executed against LanceDB
- Results ranked by semantic similarity (cosine distance)
- Top K results returned with metadata and snippets
- Empty array if no matches found (not an error)

**Voice Mode Adjustments:**
- top_k automatically clamped to max 3 results
- Optimized for low-latency delivery (<800ms target)

**Data Returned:**
```json
{
  "results": [
    {
      "id": "person:andrei_clodius",
      "type": "person",
      "title": "Andrei Clodius",
      "snippet": "...",
      "score": 0.87,
      "source_type": "kb_document",
      "metadata": {
        "file_path": "people/andrei_clodius.md",
        "chunk_index": 2,
        "entity_id": "person:andrei_clodius",
        ...
      }
    }
  ],
  "total_found": 5,
  "query": "original query text",
  "filters_applied": {...}
}
```

**Note**: The `id` field in results is the entity ID (from frontmatter), not the chunk ID. Chunk IDs follow format `{entity_id}_chunk_{index}` and are stored internally in LanceDB.

## Invariants
- Results always sorted by descending score (best match first)
- Score range: 0.0 (no match) to 1.0 (perfect match)
- Each result includes auditable source metadata (file_path, chunk_index)
- Empty results return ok=true with empty array (not an error)
- Filters are additive (AND logic, not OR)

## Failure Modes

### Validation Failures (Pre-execution)
- Query too short (<3 chars) or too long (>500 chars)
- top_k out of range (<1 or >10)
- Invalid filter type (not in enum)

### Execution Failures
- **GEMINI_API_KEY missing** → ErrorType.AUTH, not retryable
- **Embedding API rate limit** → ErrorType.RATE_LIMIT, retryable after delay
- **Embedding API timeout** → ErrorType.TRANSIENT, retryable
- **Vector store unavailable** → ErrorType.TRANSIENT, retryable
- **KB not initialized** → Returns empty results (ok=true)

### Graceful Degradation
- If filters match nothing, returns empty array (not error)
- If embedding dimension mismatch, vector store will error (caught as TRANSIENT)

## Examples

### Example 1: Simple Query (Voice Mode)
```javascript
await toolRegistry.executeTool('kb_search', {
  capabilities: { voice: true },
  args: {
    query: "Who worked on Vector Watch?"
  }
});

// Returns (auto-clamped to 3 results):
{
  ok: true,
  data: {
    results: [
      {
        id: "person:andrei_clodius",
        type: "person",
        title: "Andrei Clodius",
        snippet: "Led mobile team on Vector Watch project...",
        score: 0.89,
        metadata: { file_path: "people/andrei_clodius.md", ... }
      }
    ],
    total_found: 3,
    query: "Who worked on Vector Watch?"
  }
}
```

### Example 2: Filtered Query (Text Mode)
```javascript
await toolRegistry.executeTool('kb_search', {
  capabilities: { voice: false, messaging: true },
  args: {
    query: "AI and machine learning expertise",
    top_k: 8,
    filters: {
      type: "person"
    }
  }
});

// Returns only person entities
```

### Example 3: Empty Results
```javascript
await toolRegistry.executeTool('kb_search', {
  args: {
    query: "quantum computing blockchain NFTs"
  }
});

// Returns:
{
  ok: true,
  data: {
    results: [],
    total_found: 0,
    query: "quantum computing blockchain NFTs"
  }
}
```

## Common Mistakes

### Mistake 1: Treating empty results as error
**Problem:** Assuming empty results means tool failed
**Solution:** Empty results is success (ok=true). Check `data.total_found === 0`.

### Mistake 2: Not handling voice mode clamping
**Problem:** Expecting 10 results in voice mode
**Solution:** Voice mode auto-clamps to 3. Check capabilities before interpreting results.

### Mistake 3: Over-filtering
**Problem:** Combining restrictive filters yields no results
**Solution:** Use broader queries, then filter results programmatically if needed.

### Mistake 4: Ignoring snippet truncation
**Problem:** Expecting full document content
**Solution:** Snippets are 200 chars max. Use kb_get for full content.

### Mistake 5: Retrying on empty results
**Problem:** Repeatedly calling with same query hoping for different results
**Solution:** Empty results is deterministic. Reformulate query or remove filters.
