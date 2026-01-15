# Tool Authoring Guide

## Quick Start

Creating a new tool requires 3 files in a single directory:

```bash
mkdir tools/{tool-name}
cd tools/{tool-name}
touch schema.json guide.md handler.js
```

After creating files:
```bash
npm run build:tools  # Validate and generate registry
# Restart agents (voice-server and/or Next.js app)
```

## File Requirements

### 1. schema.json (Required)

JSON Schema (draft 2020-12) with orchestration metadata.

**Required fields:**
```json
{
  "toolId": "tool_name",
  "version": "1.0.0",
  "description": "Short description of what this tool does",

  "category": "retrieval | action | utility",
  "sideEffects": "none | read_only | writes",
  "idempotent": true,
  "requiresConfirmation": false,
  "allowedModes": ["text", "voice"],
  "latencyBudgetMs": 1000,

  "parameters": {
    "type": "object",
    "additionalProperties": false,
    "required": ["param1"],
    "properties": {
      "param1": {
        "type": "string",
        "description": "Parameter description",
        "maxLength": 200
      }
    }
  }
}
```

**Field Descriptions:**

- **`toolId`** - Canonical identifier (must match directory name with underscores for dashes)
- **`version`** - Semantic version (major.minor.patch)
- **`description`** - Brief description (used in provider schemas)
- **`category`** - Tool classification:
  - `retrieval` - Read-only, fast, idempotent (kb_search, kb_get)
  - `action` - Side effects, may need confirmation (ignore_user, calendar_create)
  - `utility` - Deterministic transforms (extract_contacts, format_datetime)
- **`sideEffects`** - Side effect classification:
  - `none` - Pure computation, no external state
  - `read_only` - Reads external state but doesn't modify
  - `writes` - Modifies external state (DB, API, files)
- **`idempotent`** - Can this tool be safely retried with same parameters?
- **`requiresConfirmation`** - Should orchestrator require user confirmation before execution?
- **`allowedModes`** - Which agent modes can use this tool? `["text"]`, `["voice"]`, or `["text", "voice"]`
- **`latencyBudgetMs`** - Performance expectation (soft limit, logs warning if exceeded)
- **`parameters`** - JSON Schema object for parameter validation
  - **MUST** have `"additionalProperties": false` (reject hallucinated params)
  - Use `"required": [...]` for mandatory params
  - Use constraints: `minLength`, `maxLength`, `minimum`, `maximum`, `enum`, `format`

**Supported formats** (via ajv-formats):
- `email` - Email address
- `date-time` - ISO 8601 datetime
- `uri` - URI/URL
- `uuid` - UUID
- `ipv4`, `ipv6` - IP addresses

**Example - Retrieval Tool:**
```json
{
  "toolId": "kb_search",
  "version": "1.0.0",
  "description": "Search knowledge base with filters. Returns structured results with citations.",
  "category": "retrieval",
  "sideEffects": "read_only",
  "idempotent": true,
  "requiresConfirmation": false,
  "allowedModes": ["text", "voice"],
  "latencyBudgetMs": 800,
  "parameters": {
    "type": "object",
    "additionalProperties": false,
    "required": ["query"],
    "properties": {
      "query": {
        "type": "string",
        "description": "Search query",
        "maxLength": 200
      },
      "top_k": {
        "type": "number",
        "description": "Number of results (voice: max 3, text: max 10)",
        "minimum": 1,
        "maximum": 10,
        "default": 5
      }
    }
  }
}
```

**Example - Action Tool with Confirmation:**
```json
{
  "toolId": "calendar_create_event",
  "version": "1.0.0",
  "description": "Create calendar event with Zoom link. Requires confirmation.",
  "category": "action",
  "sideEffects": "writes",
  "idempotent": false,
  "requiresConfirmation": true,
  "allowedModes": ["text"],
  "latencyBudgetMs": 3000,
  "parameters": {
    "type": "object",
    "additionalProperties": false,
    "required": ["title", "start_time", "end_time", "attendees"],
    "properties": {
      "title": {
        "type": "string",
        "maxLength": 200
      },
      "start_time": {
        "type": "string",
        "format": "date-time"
      },
      "attendees": {
        "type": "array",
        "items": { "type": "string", "format": "email" },
        "minItems": 1
      }
    }
  }
}
```

### 2. guide.md (Required)

Tool documentation in a simplified, flexible format.

**Format:**
```markdown
# tool_name
[1-2 sentence description]

## Parameters
- param1 (required): description
- param2 (optional): description, default value

## Examples

**Scenario 1:**
\`\`\`json
{ "param1": "value" }
\`\`\`
Description of what happens.

**Scenario 2:**
\`\`\`json
{ "param1": "value", "param2": "custom" }
\`\`\`
Description of what happens.

## Watch Out (optional)
- Common mistake 1
- Common mistake 2
```

**Guidelines:**
- First non-heading line becomes the summary (used in system prompts)
- Keep concise - especially for voice mode
- Focus on "when to use" and "common gotchas"
- Include 2-3 realistic examples with JSON

**Real Example:**
```markdown
# kb_search

Semantic search over knowledge base using natural language queries. Returns relevant people, labs, and projects with scores and citations. Voice mode auto-clamps to 3 results.

## Parameters
- **query** (required): Natural language search query (3-500 chars)
- **top_k** (optional): Number of results to return (default: 5, max: 10, voice mode: auto-clamps to 3)

## Examples

**General search:**
\`\`\`json
{
  "query": "AI researchers working on language models"
}
\`\`\`
Returns top 5 results with relevance scores.

**Specific search with limit:**
\`\`\`json
{
  "query": "robotics labs in California",
  "top_k": 3
}
\`\`\`
Returns exactly 3 results.

## Watch Out
- **Empty results don't mean failure**: Query may be too specific or data doesn't exist. Try broader terms.
- **Voice mode limits**: top_k automatically clamped to 3 for latency. Don't specify top_k > 3 in voice.
- **Use natural language**: "AI researchers" works better than keywords like "AI AND research".
```

### 3. handler.js (Required)

Execution logic that exports `execute(context)` function.

**Function signature:**
```javascript
/**
 * Tool execution handler
 * @param {object} context - Execution context
 * @param {object} context.args - Validated parameters from schema (Ajv already validated)
 * @param {string} context.clientId - Client/session identifier
 * @param {WebSocket|null} context.ws - WebSocket connection (voice mode only)
 * @param {object|null} context.geminiSession - Gemini session (voice mode only)
 * @param {object} context.session - Session state
 * @param {object} context.capabilities - Capability flags
 * @param {object} context.meta - Tool metadata
 * @returns {Promise<ToolResponse>} - Success or failure response
 */
export async function execute(context) {
  const { args, clientId, ws, geminiSession, session, capabilities, meta } = context;
  // Implementation
}
```

**Context object:**
```javascript
context = {
  args: object,              // Validated tool parameters
  clientId: string,          // Client/session identifier
  ws: WebSocket | null,      // WebSocket connection (voice mode only)
  geminiSession: object | null, // Gemini session (voice mode only)
  session: {
    isActive: boolean,
    toolsVersion: string,
    state: object  // Read-only session state snapshot
  },
  capabilities: {
    messaging: boolean,      // Has WebSocket messaging capability
    voice: boolean,          // Has voice session capability
    audit: boolean           // Has audit logging capability
  },
  meta: {
    toolId: string,
    version: string,
    category: string
  }
}
```

**Return ToolResponse:**

```javascript
// Success
return {
  ok: true,
  data: { /* Tool-specific result data */ },
  intents: [
    { type: 'END_VOICE_SESSION', after: 'current_turn' },
    { type: 'SUPPRESS_AUDIO', value: true }
  ]
};

// Domain failure (expected error)
return {
  ok: false,
  error: {
    type: ErrorType.SESSION_INACTIVE,
    message: 'Cannot execute - session already ended',
    retryable: false
  }
};

// Unexpected failure (throw ToolError)
import { ToolError, ErrorType } from '../_core/error-types.js';

throw new ToolError(ErrorType.TRANSIENT, 'WebSocket connection lost', {
  retryable: true,
  partialSideEffects: false
});
```

**Complete example:**
```javascript
import { ToolError, ErrorType, IntentType } from '../_core/error-types.js';

/**
 * Block user for specified duration
 */
export async function execute(context) {
  const { args, clientId, ws, session, capabilities } = context;
  const { duration_seconds, farewell_message } = args;

  // Semantic validation (schema already validated types/structure)
  if (!session.isActive) {
    // Expected domain failure - return as result, not exception
    return {
      ok: false,
      error: {
        type: ErrorType.SESSION_INACTIVE,
        message: 'Cannot timeout user - session already ended',
        retryable: false
      },
      intents: [],
      meta: {
        toolId: 'ignore_user',
        duration: 0,
        responseSchemaVersion: '1.0.0'
      }
    };
  }

  // Calculate timeout
  const timeoutUntil = Date.now() + (duration_seconds * 1000);

  // Send timeout command to client (voice mode)
  if (ws && capabilities.messaging) {
    try {
      ws.send(JSON.stringify({
        type: 'timeout',
        timeoutUntil,
        durationSeconds: duration_seconds,
        message: farewell_message
      }));
    } catch (error) {
      // Unexpected failure - throw ToolError
      throw new ToolError(ErrorType.TRANSIENT, 'Failed to send timeout command', {
        retryable: true
      });
    }
  }

  // Return success WITH INTENTS
  return {
    ok: true,
    data: {
      timeoutUntil,
      durationSeconds: duration_seconds,
      farewellMessage: farewell_message,
      farewellDelivered: true
    },
    intents: [
      { type: IntentType.END_VOICE_SESSION, after: 'current_turn' },
      { type: IntentType.SUPPRESS_TRANSCRIPT, value: true }
    ],
    meta: {
      toolId: 'ignore_user',
      duration: Date.now() - startTime,
      responseSchemaVersion: '1.0.0'
    }
  };
}
```

## Build & Validation

### Running the build
```bash
npm run build:tools
```

### What gets validated
- ✅ All 3 files exist (schema.json, guide.md, handler.js)
- ✅ schema.json has all required fields
- ✅ parameters is valid JSON Schema
- ✅ guide.md exists and has extractable summary
- ✅ Summary is under 250 characters
- ✅ toolId matches directory name
- ✅ category is valid (retrieval/action/utility)
- ✅ allowedModes is non-empty array
- ✅ Parameters has `additionalProperties: false`

### Build output
- Generates `tools/tool_registry.json` (gitignored)
- Contains provider-specific schemas (OpenAI + Gemini Native)
- Version hash based on content (deterministic)
- Git commit captured

## Testing Tools

(To be added in Phase 5)

## Tool Categories Best Practices

### Retrieval Tools
- **MUST** be `idempotent: true`
- **MUST** have `sideEffects: "read_only"` or `"none"`
- Should be fast (voice: <800ms, text: <2s)
- Return structured data with citations/sources
- Examples: `kb_search`, `kb_get`, `calendar_get_availability`

### Action Tools
- Set `sideEffects: "writes"` if modifying state
- Set `requiresConfirmation: true` for important actions (calendar, payments)
- May be `idempotent: false`
- Should include clear success/failure indication
- Examples: `ignore_user`, `calendar_create_event`, `end_voice_session`

### Utility Tools
- Usually `sideEffects: "none"`
- Should be deterministic and fast
- Good for when you need predictable behavior (not LLM interpretation)
- Examples: `extract_contacts`, `format_datetime`, `validate_email`

## Common Patterns

### Pattern: Plan Then Commit
For expensive/irreversible actions, create two tools:
1. Planning tool (retrieval or utility, no confirmation)
2. Commit tool (action, requires confirmation)

Example:
- `image_draft_prompt` (utility) → agent refines → `image_generate` (action, confirmed)
- `calendar_get_availability` (retrieval) → agent discusses → `calendar_create_event` (action, confirmed)

### Pattern: Read-Modify-Write
For tools that need to check state before acting:
```javascript
export async function execute({ args, context }) {
  // 1. Read current state
  const currentState = await fetchState();

  // 2. Validate preconditions
  if (!canProceed(currentState)) {
    return { ok: false, error: { type: ErrorType.CONFLICT, ... } };
  }

  // 3. Perform action
  await modifyState(args);

  // 4. Return success
  return { ok: true, data: { ... } };
}
```

### Pattern: Graceful Degradation
Handle missing capabilities gracefully:
```javascript
export async function execute({ args, context }) {
  // Try primary method
  try {
    const result = await primaryMethod(args);
    return { ok: true, data: result };
  } catch (error) {
    // Fall back to secondary method
    if (error.code === 'NOT_AVAILABLE') {
      const result = await fallbackMethod(args);
      return { ok: true, data: { ...result, degraded: true } };
    }
    throw error;
  }
}
```

## Troubleshooting

### Build fails with "Missing required field"
Check `schema.json` has all required fields (see schema.json section above)

### Build fails with "Invalid JSON Schema"
- Validate parameters object at https://www.jsonschemavalidator.net/
- Ensure `additionalProperties: false` is present
- Check format fields are supported (email, date-time, uri, uuid)

### Build fails with "Summary missing or too long"
Check `guide.md` first non-heading line exists and is under 250 characters

### Build fails with "toolId doesn't match directory"
- Directory: `tools/my-tool/` → toolId: `"my_tool"` (underscore)
- Directory and schema.json toolId must match (with dash→underscore conversion)

### Tool not available in agents after build
- Did you restart the agents? (registry loaded at startup)
- Check `npm run build:tools` completed successfully
- Check `tools/tool_registry.json` exists and contains your tool

## Integration Status

**Current Status:** ✅ **FULLY INTEGRATED**

Both agents are now using the unified tool registry system:

- ✅ **Voice Server** (`voice-server/server.js`)
  - Registry loads at startup
  - All 5 tools available via `geminiToolSchemas`
  - State controller manages session state
  - Transport layer handles tool call/response protocol
  - Policy enforcement (budgets, mode restrictions) operational

- ✅ **Text Agent** (`app/api/chat/route.ts`)
  - Registry loads on first API request
  - All 5 tools available via `providerSchemas` (JSON Schema format)
  - State controller initialized per request
  - Tool execution via `toolRegistry.executeTool()`
  - Next.js webpack configuration for handler loading

**Available Tools:** 5 tools
1. `ignore_user` - Block disrespectful users (text + voice)
2. `start_voice_session` - Initiate voice mode (text only)
3. `end_voice_session` - End voice session gracefully (voice only)
4. `kb_search` - Search knowledge base (text + voice)
5. `kb_get` - Get knowledge base entity (text + voice)

## Documentation Maintenance

### Single Source of Truth Principle

To prevent documentation conflicts and drift:

**1. Tool-specific docs: ONLY in `/tools/{tool-name}/guide.md`**
- NEVER duplicate in voice-server/prompts/
- NEVER copy-paste into other docs (link instead)
- Tool documentation lives with the tool code

**2. Tool system docs: ONLY in `/tools/ARCHITECTURE.md`**
- Discovery model, registry design, build process
- Other docs should link here, not duplicate

**3. Tool authoring: ONLY in `/tools/README.md`** (this file)
- How to create new tools, guide.md format
- schema.json structure, handler.js requirements

**4. Metrics & observability: ONLY in `/tools/OBSERVABILITY.md`**
- Loop detection, response metrics, context monitoring
- How to use /metrics endpoint

**5. Voice behavior: ONLY in `/voice-server/prompts/*.md`**
- System personality, voice-specific behavior
- NO tool documentation here (tools pull from registry)

### Before Adding Documentation

1. **Check:** Does this info exist elsewhere?
2. **If yes:** Link to existing doc instead of duplicating
3. **If no:** Choose the right home based on hierarchy above
4. **Update:** Add cross-references so others can find it

### Red Flags (Signs of Documentation Drift)

- Same concept explained in 2+ places
- Copy-pasted code examples
- Conflicting version numbers or architectures
- Outdated tool structure references (doc.md, doc_summary.md)
- References to removed folders (voice-server/prompts/tools/)

### Documentation Hierarchy

```
├── README.md (project overview, quick start)
│
├── tools/
│   ├── ARCHITECTURE.md (system design, discovery model, registry)
│   ├── README.md (tool authoring guide ← YOU ARE HERE)
│   ├── OBSERVABILITY.md (metrics, loop detection, monitoring)
│   ├── PHASES.md (implementation phases)
│   ├── TROUBLESHOOTING.md (common issues)
│   └── {tool-name}/guide.md (tool-specific docs)
│
├── voice-server/
│   ├── README.md (voice server setup, deployment)
│   └── prompts/*.md (system behavior, NO tool docs)
│
└── DEPLOYMENT_CHECKLIST.md (deployment process)
```

### When Updating Tools

**If you change a tool:**
1. Update `tools/{tool-name}/guide.md` (examples, parameters, etc.)
2. Update `tools/{tool-name}/schema.json` if parameters changed
3. Run `npm run build:tools` to regenerate registry
4. Restart agents (voice-server and/or Next.js app)
5. Do NOT edit voice-server prompts for tool-specific changes

**If you change the tool system architecture:**
1. Update `tools/ARCHITECTURE.md`
2. Cross-reference from other docs that reference the architecture
3. Update build scripts if validation changed
4. Update this file (README.md) if authoring process changed

**If you add new metrics or observability:**
1. Update `tools/OBSERVABILITY.md`
2. Update metrics endpoint implementation
3. Add examples and troubleshooting guidance

## Next Steps

After creating a tool, see:
- [tools/ARCHITECTURE.md](./ARCHITECTURE.md) - Understand overall system design
- [tools/OBSERVABILITY.md](./OBSERVABILITY.md) - Monitor tool performance and behavior
- [tools/PHASES.md](./PHASES.md) - See implementation roadmap and current status
- [tools/TROUBLESHOOTING.md](./TROUBLESHOOTING.md) - Debug common issues
