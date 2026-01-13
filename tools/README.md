# Tool Authoring Guide

## Quick Start

Creating a new tool requires 4 files in a single directory:

```bash
mkdir tools/{tool-name}
cd tools/{tool-name}
touch schema.json doc_summary.md doc.md handler.js
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

### 2. doc_summary.md (Required)

**2-4 line summary** injected into agent system prompts.

**Keep tight** - Voice mode has strict latency budgets. Every word counts.

**Good example:**
```markdown
Block user who is rude/abusive for specified duration (30s-24h). Ends voice session after farewell is spoken. Follow escalation: warn first (unless extreme), then escalate based on severity.
```

**Bad example (too verbose):**
```markdown
This tool allows you to block users who are being rude, disrespectful, or abusive in any way. The user will not be able to send messages for the specified duration, which can be anywhere from 30 seconds to 24 hours. After you call this tool, the voice session will end after your farewell message is spoken to the user. You should follow the escalation policy documented in core.md, which means you should warn the user first unless the abuse is extreme, and then escalate the timeout duration based on the severity of the offense.
```

### 3. doc.md (Required)

Full structured documentation with **required sections** (build script validates):

**Required sections:**
- `## Summary`
- `## Preconditions`
- `## Postconditions`
- `## Invariants`
- `## Failure Modes`
- `## Examples`
- `## Common Mistakes`

**Template:**
```markdown
# {Tool Name}

## Summary
Brief description of what this tool does and when to use it.

## Preconditions
What must be true before calling this tool?
- Condition 1
- Condition 2

## Postconditions
What will be true after successful execution?
- State change 1
- Side effect 2

## Invariants
What is always true about this tool?
- Invariant 1 (e.g., "Duration always between 30-86400 seconds")
- Invariant 2 (e.g., "Tool is NOT idempotent")

## Failure Modes
How can this tool fail and what happens?
- **Error Type 1**: Description, retryability, side effects
- **Error Type 2**: Description, retryability, side effects

## Examples

### Example 1: {Scenario Name}
Context: {Describe situation}
Action:
\`\`\`json
{
  "param1": "value1"
}
\`\`\`
Result: {What happens}

### Example 2: {Another Scenario}
{Similar structure}

## Common Mistakes (Do Not)
❌ Mistake 1 - Why it's wrong
❌ Mistake 2 - Why it's wrong
✅ Correct approach
```

**Real Example:**
```markdown
# Timeout Tool (ignore_user)

## Summary
Block users who are rude, disrespectful, or abusive. User cannot send messages for the specified duration.

## Preconditions
- User has committed offense worthy of timeout
- You have followed escalation policy (see core.md) unless extreme abuse

## Postconditions
- Voice session ends after farewell is spoken
- User blocked for duration_seconds
- Client UI shows timeout message and countdown
- Audit log entry created with reason

## Invariants
- Farewell message WILL be spoken in voice mode before block takes effect
- Duration between 30-86400 seconds (enforced by schema)
- Tool is NOT idempotent (repeated calls extend timeout)

## Failure Modes
- **SESSION_INACTIVE**: Session already ended, returns error, no side effects
- **VALIDATION**: Invalid duration, registry rejects before execution
- **TRANSIENT**: WebSocket closed, logs issue, no timeout applied

## Examples

### Example 1: Second Offense
User: "You're being really annoying"
Your response: [Verbal warning per core.md policy]
User: "Seriously, shut up"
Your action:
\`\`\`json
{
  "duration_seconds": 60,
  "farewell_message": "I don't tolerate disrespect. This conversation is over."
}
\`\`\`

### Example 2: Extreme Abuse
User: [Vile insult/threat]
Your action:
\`\`\`json
{
  "duration_seconds": 86400,
  "farewell_message": "That behavior is completely unacceptable. You're blocked for 24 hours."
}
\`\`\`

## Common Mistakes (Do Not)
❌ Use this tool based on past conversation history (only current session)
❌ Threaten to use it (either warn or act)
❌ Use out of annoyance (only when respect is broken)
❌ Forget expired timeouts are "paid for" (reset escalation after timeout)
```

### 4. handler.js (Required)

Execution logic that exports `execute({ args, context })` function.

**Function signature:**
```javascript
/**
 * Tool execution handler
 * @param {object} params
 * @param {object} params.args - Validated parameters from schema (Ajv already validated)
 * @param {object} params.context - Execution context with capabilities
 * @returns {Promise<ToolResponse>} - Success or failure response
 */
export async function execute({ args, context }) {
  // Implementation
}
```

**Context object:**
```javascript
context = {
  clientId: string,
  tool: {
    id: string,
    version: string,
    idempotent: boolean
  },
  session: {
    isActive: boolean,
    toolsVersion: string,
    state: object  // Read-only session state
  },
  messaging: {
    send: async (message) => { /* Send message to client */ }
  },
  voice: {
    isActive: () => boolean  // Check if voice mode active
  },
  audit: {
    log: (event, data) => { /* Log audit event */ }
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
import { ToolError, ErrorType } from '../_core/error-types.js';

/**
 * Block user for specified duration
 */
export async function execute({ args, context }) {
  const { duration_seconds, farewell_message } = args;

  // Semantic validation (schema already validated types/structure)
  if (!context.session.isActive) {
    // Expected domain failure - return as result, not exception
    return {
      ok: false,
      error: {
        type: ErrorType.SESSION_INACTIVE,
        message: 'Cannot timeout user - session already ended',
        retryable: false
      }
    };
  }

  // Calculate timeout
  const timeoutUntil = Date.now() + (duration_seconds * 1000);

  // Send timeout command to client (side effect)
  try {
    await context.messaging.send({
      type: 'timeout',
      durationSeconds: duration_seconds,
      timeoutUntil,
      farewellMessage: farewell_message
    });
  } catch (error) {
    // Unexpected failure - throw ToolError
    throw new ToolError(ErrorType.TRANSIENT, 'Failed to send timeout command', {
      retryable: true,
      partialSideEffects: false
    });
  }

  // Log for audit trail
  context.audit.log('user_timeout', {
    duration: duration_seconds,
    timeoutUntil
  });

  // Return success WITH INTENTS
  return {
    ok: true,
    data: {
      timeoutUntil,
      duration: duration_seconds
    },
    intents: [
      { type: 'END_VOICE_SESSION', after: 'farewell_spoken' },
      { type: 'SUPPRESS_AUDIO', value: true }
    ]
  };
}
```

## Build & Validation

### Running the build
```bash
npm run build:tools
```

### What gets validated
- ✅ All 4 files exist (schema.json, doc_summary.md, doc.md, handler.js)
- ✅ schema.json has all required fields
- ✅ parameters is valid JSON Schema
- ✅ doc_summary.md is under 250 characters
- ✅ doc.md has all required sections
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

### Build fails with "Missing required section"
Check `doc.md` has all 7 required sections (## Summary, ## Preconditions, etc.)

### Build fails with "toolId doesn't match directory"
- Directory: `tools/my-tool/` → toolId: `"my_tool"` (underscore)
- Directory and schema.json toolId must match (with dash→underscore conversion)

### Tool not available in agents after build
- Did you restart the agents? (registry loaded at startup)
- Check `npm run build:tools` completed successfully
- Check `tools/tool_registry.json` exists and contains your tool

## Next Steps

After creating a tool, see:
- `tools/ARCHITECTURE.md` - Understand overall system design
- `tools/PHASES.md` - See implementation roadmap
- `voice-server/INTEGRATION.md` - How voice agent uses tools
- `app/api/chat/INTEGRATION.md` - How text agent uses tools
