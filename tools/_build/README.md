# Build Process Documentation

## Overview

The tool registry build process transforms tool definitions into a compiled artifact (`tool_registry.json`) with validation and **canonical JSON Schema** for each tool.

## Build Command

```bash
npm run build:tools
```

This runs `node tools/_build/tool-builder.js`

## Build Pipeline

### 1. Tool Discovery
- Scans `tools/*/` directories
- Ignores `_core/`, `_build/`, and hidden directories
- Each directory must contain 4 files

### 2. File Validation
For each tool directory, validates:
- ✅ `schema.json` exists and is valid JSON
- ✅ `doc_summary.md` exists and is under 250 characters
- ✅ `doc.md` exists and has all required sections
- ✅ `handler.js` exists

### 3. Schema Validation
- Parse `schema.json`
- Validate required fields (toolId, version, category, parameters, etc.)
- Compile parameters with Ajv (JSON Schema draft 2020-12)
- Check `additionalProperties: false` is present
- Validate category is valid (retrieval/action/utility)
- Validate allowedModes is non-empty array
- Check toolId matches directory name (with dash→underscore)

### 4. Documentation Validation
- Check `doc_summary.md` length (max 250 chars)
- Parse `doc.md` and verify required sections:
  - ## Summary
  - ## Preconditions
  - ## Postconditions
  - ## Invariants
  - ## Failure Modes
  - ## Examples
  - ## Common Mistakes

### 5. Provider Schema Derivation (Runtime)
- Registry emits canonical JSON Schema only (`jsonSchema`)
- Provider-specific schema views are derived at runtime by the registry loader (and cached)

### 6. Artifact Generation
- Compute content-based version hash (SHA256 of tool IDs + schemas + docs)
- Capture git commit (if available)
- Capture build timestamp
- Assemble tool_registry.json with:
  - version (e.g., "1.0.abc123de")
  - gitCommit (short hash)
  - buildTimestamp (ISO 8601)
  - tools array with all metadata

### 7. Output
- Write `tools/tool_registry.json` (gitignored)
- Log success with version and tool count
- Exit with code 0 (success) or 1 (failure)

## Build Artifact Structure

```json
{
  "version": "1.0.abc123de",
  "gitCommit": "a1b2c3d4",
  "buildTimestamp": "2026-01-13T10:00:00.000Z",
  "tools": [
    {
      "toolId": "ignore_user",
      "version": "1.0.0",
      "category": "action",
      "sideEffects": "writes",
      "idempotent": false,
      "requiresConfirmation": false,
      "allowedModes": ["text", "voice"],
      "latencyBudgetMs": 1000,
      "jsonSchema": {
        "type": "object",
        "additionalProperties": false,
        "required": ["duration_seconds", "farewell_message"],
        "properties": { /* ... */ }
      },
      // Provider schemas are derived at runtime (not stored in artifact)
      "summary": "Block user for specified duration...",
      "documentation": "# ignore_user\n\n## Summary...",
      "handlerPath": "file:///path/to/handler.js"
    }
  ]
}
```

## Provider Schema Views (Runtime)

### OpenAI-Compatible Tools

**Purpose:** Convert to OpenAI function calling format

**Implementation:** Wrapper around canonical JSON Schema (OpenAI uses JSON Schema natively)

**Output:**
```json
{
  "type": "function",
  "function": {
    "name": "tool_name",
    "description": "Tool description",
    "parameters": { /* JSON Schema */ }
  }
}
```

### Gemini JSON Schema (Gemini 3)

**Purpose:** Provide `parametersJsonSchema` for Gemini tool calling

**Implementation:** Pass canonical JSON Schema through as `parametersJsonSchema` (no conversion needed)

**Output:**
```json
{
  "name": "tool_name",
  "description": "Tool description",
  "parametersJsonSchema": { /* JSON Schema */ }
}
```

### Gemini Native (Voice / Live)

**Purpose:** Provide `parameters` using Gemini “native” type strings (`"OBJECT"`, `"STRING"`, ...)

**Implementation:** Runtime conversion from canonical JSON Schema (minimal subset: type/properties/items/required/enum/description)

## Ajv Configuration

```javascript
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const ajv = new Ajv({
  allErrors: true,           // Report all errors, not just first
  useDefaults: true,         // Apply default values from schema
  coerceTypes: false,        // Don't auto-coerce types
  removeAdditional: false,   // Don't silently drop unknown params
  strict: true               // Strict schema validation
});

addFormats(ajv);  // Add format validators (email, date-time, uri, etc.)
```

**Supported formats:**
- `email`
- `date-time` (ISO 8601)
- `uri` / `url`
- `uuid`
- `ipv4` / `ipv6`

## Versioning Strategy

### Content-Based Version
- Hash of tool IDs + schemas + documentation
- Format: `1.0.{8-char-hash}`
- Deterministic (same content → same version)
- Changes automatically bump version

### Git Commit Tracking
- Captures short git commit hash at build time
- Links registry version to source code version
- Useful for debugging and audit trail

### Build Timestamp
- ISO 8601 timestamp of build
- Helps identify when artifact was generated

## Error Handling

### Build Failures
Build fails if:
- Missing required files (schema.json, doc_summary.md, doc.md, handler.js)
- Invalid JSON in schema.json
- Invalid JSON Schema syntax in parameters
- Missing required schema fields
- Invalid category or allowedModes values
- toolId doesn't match directory name
- doc_summary.md too long (>250 chars)
- doc.md missing required sections
- Missing `additionalProperties: false` in parameters

### Error Messages
- Clear indication of which tool failed
- Specific error message (e.g., "Missing required field: category")
- Build exits with code 1 (non-zero)

## Implementation Status

**Phase 0:** ✅ Structure and documentation complete
**Phase 1:** 🚧 Implementation pending

## Future Enhancements

- Watch mode for development (auto-rebuild on file changes)
- Incremental builds (only rebuild changed tools)
- Build caching
- Parallel tool builds
- JSON Schema $ref support (shared definitions)
- Custom format validators
- Build performance metrics
