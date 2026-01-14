# kb_get

## Summary
Direct retrieval of KB documents by exact entity ID. Faster than semantic search when you already know the entity ID from previous search results. Returns complete document content including all chunks.

## Preconditions
- KB must be initialized with embedded documents (run `npx tsx scripts/Embed/embed-kb.ts`)
- Must have exact entity ID in format "type:name" (e.g., "person:andrei_clodius")
- Entity must exist in KB (use kb_search to discover IDs)
- Entity ID comes from frontmatter `id` field, stored as `entity_id` in vector store

## Postconditions

**Success Case:**
- All document chunks retrieved from vector store
- Chunks reassembled in order (by chunk_index)
- Full content returned with complete metadata
- Faster than kb_search (no embedding generation, direct lookup)

**Data Returned:**
```json
{
  "id": "person:andrei_clodius",
  "type": "person",
  "title": "Andrei Clodius",
  "content": "Full combined text from all chunks...",
  "metadata": {
    "aliases": ["..."],
    "roles": ["..."]
  },
  "chunks_count": 3
}
```

## Invariants
- ID must exactly match (case-sensitive, format: "type:name")
- Returns complete document (all chunks combined)
- Metadata extracted from first chunk (frontmatter consistent across chunks)
- Faster than kb_search (~500ms vs ~800ms typical latency)

## Failure Modes

### Validation Failures
- Invalid ID format (must match pattern "^[a-z_]+:[a-z0-9_]+$")
- ID too short (<3 chars) or too long (>100 chars)

### Execution Failures
- **Entity not found** → ErrorType.PERMANENT (not retryable, ID doesn't exist)
- **Vector store unavailable** → ErrorType.TRANSIENT (retryable)
- **KB not initialized** → ErrorType.PERMANENT (no documents loaded)

### Performance Degradation
- Large KB (>10,000 chunks) may slow down retrieval
- Current implementation loads all IDs (optimization opportunity)

## Examples

### Example 1: Get Person Entity
```javascript
// After finding entity via kb_search
await toolRegistry.executeTool('kb_get', {
  args: {
    id: "person:andrei_clodius"
  }
});

// Returns full document with complete content
```

### Example 2: Get Project Entity
```javascript
await toolRegistry.executeTool('kb_get', {
  args: {
    id: "project:vector_watch_project"
  }
});
```

### Example 3: Entity Not Found
```javascript
await toolRegistry.executeTool('kb_get', {
  args: {
    id: "person:nonexistent"
  }
});

// Returns:
{
  ok: false,
  error: {
    type: "PERMANENT",
    message: "Entity 'person:nonexistent' not found in KB",
    retryable: false
  }
}
```

## Common Mistakes

### Mistake 1: Using kb_get for search
**Problem:** Trying to find entities without knowing exact ID
**Solution:** Use kb_search first to discover IDs, then kb_get for full content.

### Mistake 2: Incorrect ID format
**Problem:** Using display name instead of ID ("Andrei Clodius" vs "person:andrei_clodius")
**Solution:** IDs follow format "type:name" (snake_case), get from kb_search results.

### Mistake 3: Assuming case-insensitive matching
**Problem:** Using "Person:Andrei_Clodius" instead of "person:andrei_clodius"
**Solution:** IDs are case-sensitive, always lowercase type and name.

### Mistake 4: Retrying on PERMANENT errors
**Problem:** Repeatedly calling with invalid ID
**Solution:** PERMANENT errors mean ID doesn't exist, reformulate query or use kb_search.

### Mistake 5: Expecting snippet vs full content
**Problem:** Assuming content is truncated like kb_search snippets
**Solution:** kb_get returns FULL content (all chunks combined), can be long.
