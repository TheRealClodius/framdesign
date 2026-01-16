# Scripts Directory

This directory contains utility scripts organized by subject area.

## Structure

```
scripts/
├── Deployment/          # Deployment scripts
│   └── prod/           # Production deployment
├── Embed/              # KB embedding scripts
├── Testing/            # Testing scripts
│   ├── integration/    # Integration tests
│   └── kb/             # KB tool tests
└── README.md           # This file
```

## Quick Reference

### KB Embedding

**To re-embed KB:**
```bash
npx tsx scripts/Embed/embed-kb.ts
```

**To verify embedding:**
```bash
npx tsx scripts/Embed/verify-kb-embedding.ts
```

### Deployment

**Deploy voice server to Railway:**
```bash
./scripts/Deployment/prod/deploy-voice-server.sh
```

### Testing

**Run integration tests:**
```bash
./scripts/Testing/integration/test-integration.sh
```

**Test KB tools:**
```bash
npx tsx scripts/Testing/kb/test-kb-tools.ts
```

**Test vector search:**
```bash
npx tsx scripts/Testing/kb/test-search.ts "your query"
```

## Documentation

- [`Embed/`](./Embed/) - KB embedding scripts and documentation
- [`Deployment/`](./Deployment/) - Deployment scripts
- [`Testing/`](./Testing/) - Testing scripts

## Related Files

- `lib/services/vector-store-service.ts` - Qdrant operations
- `lib/services/embedding-service.ts` - Embedding generation
- `docs/KB_EMBEDDING.md` - Comprehensive KB embedding guide
