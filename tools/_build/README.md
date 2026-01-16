# Build Process Documentation

## Overview

The tool registry build process transforms tool definitions into a compiled artifact (`tool_registry.json`) with validation and provider-specific schemas.

## Build Command

```bash
npm run build:tools
```

This runs `node tools/_build/tool-builder.js`

## Build Pipeline

### 1. Tool Discovery
- Scans `tools/*/` directories
- Ignores `_core/`, `_build/`, and hidden directories
- Each directory must contain 3 files

### 2. File Validation
For each tool directory, validates:
- ✅ `schema.json` exists and is valid JSON
- ✅ `guide.md` exists
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
- Check `guide.md` exists
- Extract summary from first non-heading line
- Validate summary is under 250 chars
- No required section structure (flexible format)

### 5. Provider Schema Generation
- Convert canonical JSON Schema to provider-specific formats
- **OpenAI adapter** (`toOpenAI`): Pass-through (OpenAI uses JSON Schema)
- **Gemini Native adapter** (`toGeminiNative`): Convert to Type.* enums
- Both schemas generated unconditionally (not optional)
- Requires `@google/genai` installed (even if only using OpenAI at runtime)

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
      "providerSchemas": {
        "openai": {
          "type": "function",
          "function": {
            "name": "ignore_user",
            "description": "Block user for specified duration...",
            "parameters": { /* JSON Schema */ }
          }
        },
        "geminiNative": {
          "name": "ignore_user",
          "description": "Block user for specified duration...",
          "parameters": {
            "type": /* Type.OBJECT */,
            "properties": { /* Type.* enums */ }
          }
        }
      },
      "summary": "Block user for specified duration...",
      "documentation": "# ignore_user\n\n## Summary...",
      "handlerPath": "file:///path/to/handler.js"
    }
  ]
}
```

## Provider Adapters

### OpenAI Adapter (openai.js)

**Purpose:** Convert to OpenAI function calling format

**Implementation:** Pass-through (OpenAI uses JSON Schema natively)

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

### Gemini Native Adapter (gemini-native.js)

**Purpose:** Convert to Gemini SDK Type.* format

**Implementation:** Recursive conversion

**Type mapping:**
- `string` → `Type.STRING`
- `number` / `integer` → `Type.NUMBER`
- `boolean` → `Type.BOOLEAN`
- `object` → `Type.OBJECT` (recursively convert properties)
- `array` → `Type.ARRAY` (recursively convert items)

**Output:**
```javascript
{
  name: "tool_name",
  description: "Tool description",
  parameters: {
    type: Type.OBJECT,
    properties: {
      param1: { type: Type.STRING, description: "..." }
    },
    required: ["param1"]
  }
}
```

**Critical:** Handles nested objects and arrays recursively

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
- Missing required files (schema.json, guide.md, handler.js)
- Invalid JSON in schema.json
- Invalid JSON Schema syntax in parameters
- Missing required schema fields
- Invalid category or allowedModes values
- toolId doesn't match directory name
- guide.md summary missing or too long (>250 chars)
- Missing `additionalProperties: false` in parameters

### Error Messages
- Clear indication of which tool failed
- Specific error message (e.g., "Missing required field: category")
- Build exits with code 1 (non-zero)

## Implementation Status

**Phase 0:** ✅ Structure and documentation complete  
**Phase 1:** ✅ Build system and adapters implemented

## Future Enhancements

- Watch mode for development (auto-rebuild on file changes)
- Incremental builds (only rebuild changed tools)
- Build caching
- Parallel tool builds
- JSON Schema $ref support (shared definitions)
- Custom format validators
- Build performance metrics
