# KB Embedding Modification Checklist

When modifying the embedding process, use this checklist to ensure correctness.

## Before Making Changes

- [ ] Read `docs/KB_EMBEDDING.md` for full context
- [ ] Read `scripts/Embed/README.md` for critical notes
- [ ] Understand the ID format: `{entity_id}_chunk_{index}`

## Critical Rules (MUST FOLLOW)

### ✅ Document ID Format
- [ ] Chunk IDs use format: `{entity_id}_chunk_{index}`
- [ ] Even single-chunk files get `_chunk_0` suffix
- [ ] `baseId` comes from `frontmatter.id` or `fileId` (line 144)

### ✅ Frontmatter ID Handling
- [ ] Frontmatter `id` is stored as `entity_id` in metadata (line 173)
- [ ] Frontmatter `id` is excluded from metadata loop (line 185)
- [ ] Never add `id` field to `flattenedMetadata`

### ✅ Metadata ID Exclusion
- [ ] `vector-store-service.ts` skips `id` when merging metadata (line 122)
- [ ] This prevents overwriting document IDs

### ✅ File Exclusion
- [ ] `README.md` is excluded from embedding (line 80)
- [ ] Only `.md` files in `kb/` directory are processed

## After Making Changes

- [ ] Run embedding: `npx tsx scripts/Embed/embed-kb.ts`
- [ ] Run verification: `npx tsx scripts/Embed/verify-kb-embedding.ts`
- [ ] Verify no duplicate IDs exist
- [ ] Verify all KB files are embedded
- [ ] Check for orphaned chunks

## Common Mistakes to Avoid

❌ **Adding frontmatter `id` to metadata**
```typescript
// WRONG
flattenedMetadata.id = frontmatter.id;
```

❌ **Using entity ID directly as document ID**
```typescript
// WRONG - causes duplicates
id: baseId
```

❌ **Skipping ID exclusion in metadata merge**
```typescript
// WRONG - overwrites document ID
row[key] = value; // without checking for 'id'
```

## Testing

After changes, verify:
1. All chunks have unique IDs
2. No duplicate IDs exist
3. All KB files are embedded
4. Metadata structure is correct
5. Entity IDs are stored correctly

## Related Code Locations

- **Embedding script**: `scripts/Embed/embed-kb.ts`
  - Line 144: `baseId` definition
  - Line 173: `entity_id` in metadata
  - Line 185: Exclude `id` from frontmatter
  - Line 202: Document ID format

- **Vector store service**: `lib/services/vector-store-service.ts`
  - Line 112: Document ID assignment
  - Line 122: Exclude `id` from metadata merge
  - Line 138: Table drop/recreate

## Questions?

If unsure about any change:
1. Check `docs/KB_EMBEDDING.md`
2. Review `scripts/Embed/README.md`
3. Run verification script
4. Test with a small subset first
