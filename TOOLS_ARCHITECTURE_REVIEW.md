# Tool Registry Architecture - Stashed Work Review

## Executive Summary

**This is the REAL stashed work** that broke deployment - a complete architectural overhaul implementing an enterprise-grade tool registry system.

**Stats:**
- **13,549 lines added** ✅
- **1,602 lines removed** ❌
- **54 files changed**
- **5,392 lines** of planning documentation alone
- **3 commits**: "created new KB", "Update package-lock.json", "tool updated"

---

## What Was Actually Built

### 1. **Tool Registry System** (Complete Build Pipeline)

A build-time compilation system that converts tool definitions into a runtime registry:

**Architecture:**
```
tools/
├── _build/                      # Build-time infrastructure
│   ├── tool-builder.js         # Main build script (327 lines)
│   └── provider-adapters/      # Schema converters
│       ├── openai.js           # OpenAI function format (34 lines)
│       └── gemini-native.js    # Gemini Type.* format (73 lines)
│
├── _core/                       # Runtime infrastructure
│   ├── error-types.js          # ErrorType enum, ToolError (108 lines)
│   ├── tool-response.js        # ToolResponse envelope (130 lines)
│   ├── registry.js             # Runtime loader (383 lines)
│   └── state-controller.js     # State management (119 lines)
│
├── {tool-name}/                 # Individual tools
│   ├── schema.json             # JSON Schema + metadata
│   ├── doc_summary.md          # 250 char summary
│   ├── doc.md                  # Full structured docs
│   └── handler.js              # Execution logic
│
└── tool_registry.json           # GENERATED BUILD ARTIFACT
```

**Build Process:**
```bash
npm run build:tools
```

**What it does:**
1. Scans `tools/*/` directories (ignores `_core`, `_build`)
2. Validates JSON Schema (draft 2020-12) with Ajv
3. Validates documentation structure (7 required sections)
4. Generates provider-specific schemas (OpenAI + Gemini)
5. Content-based versioning (SHA256 hash)
6. Outputs `tools/tool_registry.json`

**Registry Structure:**
```json
{
  "version": "1.0.abc123de",
  "gitCommit": "a1b2c3d4",
  "buildTimestamp": "2026-01-13T10:00:00Z",
  "tools": [
    {
      "toolId": "ignore_user",
      "category": "action",
      "sideEffects": "writes",
      "idempotent": false,
      "requiresConfirmation": false,
      "allowedModes": ["text", "voice"],
      "latencyBudgetMs": 1000,
      "jsonSchema": { /* canonical schema */ },
      "providerSchemas": {
        "openai": { /* OpenAI format */ },
        "geminiNative": { /* Gemini Type.* format */ }
      },
      "summary": "Block user for 30s-24h...",
      "documentation": "# ignore_user\n\n...",
      "handlerPath": "file:///path/to/handler.js"
    }
  ]
}
```

### 2. **Two Production Tools Created**

#### Tool: `ignore_user`
**Files:**
- `tools/ignore-user/schema.json` (30 lines)
- `tools/ignore-user/doc_summary.md` (1 line)
- `tools/ignore-user/doc.md` (150 lines)
- `tools/ignore-user/handler.js` (91 lines)

**Purpose:** Punitive timeout for disrespectful users

**Features:**
- Duration: 30s to 24h based on severity
- Escalation policy (warn first, then timeout)
- Farewell message delivery (spoken in voice mode)
- Returns intents: END_VOICE_SESSION, SUPPRESS_TRANSCRIPT

**Handler Logic:**
```javascript
export async function execute({ duration_seconds, farewell_message }, context) {
  const { state } = context;

  // Calculate timeout
  const now = Date.now();
  const timeoutUntil = now + (duration_seconds * 1000);

  return {
    success: true,
    result: {
      type: "action_applied",
      details: {
        action: "user_ignored",
        duration_seconds,
        timeout_until: timeoutUntil,
        farewell_message
      }
    },
    intents: [
      { type: "END_VOICE_SESSION" },
      { type: "SUPPRESS_TRANSCRIPT", value: true },
      { type: "SET_STATE", key: "timeoutUntil", value: timeoutUntil }
    ]
  };
}
```

#### Tool: `end_voice_session`
**Files:**
- `tools/end-voice-session/schema.json` (29 lines)
- `tools/end-voice-session/doc_summary.md` (1 line)
- `tools/end-voice-session/doc.md` (128 lines)
- `tools/end-voice-session/handler.js` (55 lines)

**Purpose:** Graceful voice session termination

**Features:**
- Voice mode only (returns MODE_RESTRICTED in text)
- Optional final message to deliver
- Idempotent (safe to call multiple times)
- Optional text message to inject into chat

**Handler Logic:**
```javascript
export async function execute({ final_message, text_message_to_inject }, context) {
  const { state } = context;

  // Mode check
  if (state.get('mode') !== 'voice') {
    throw new ToolError(ErrorType.MODE_RESTRICTED,
      'end_voice_session can only be called in voice mode');
  }

  const intents = [{ type: "END_VOICE_SESSION" }];

  if (text_message_to_inject) {
    intents.push({
      type: "INJECT_TEXT_MESSAGE",
      value: text_message_to_inject
    });
  }

  return {
    success: true,
    result: { type: "action_applied", details: { action: "voice_session_ended" }},
    intents
  };
}
```

### 3. **Knowledge Base System** (kb/)

Structured information about the user (Andrei Clodius) for AI personalization:

**Structure:**
```
kb/
├── README.md                    # Schema registry
├── people/
│   └── andrei_clodius.md       # 163 lines - Full bio, experience, principles
├── lab/
│   └── fram_design.md          # 87 lines - Studio info
├── project/
│   ├── vector_watch_project.md # 57 lines - Past project
│   └── fitbit_OS_project.md    # Empty placeholder
└── assets/
    └── vector/
        ├── manifest.json
        └── vector watch.jpeg   # 64KB image
```

**Entity Types:**
- **person** - Individuals (with bio, education, experience, contacts)
- **lab** - Organizations (FRAM Design)
- **project** - Shipped or ongoing work (Vector Watch, Fitbit)

**Schema (from kb/README.md):**
```yaml
person:
  id: "person:{filename}"          # person:andrei_clodius
  type: enum("person")
  title: string                    # Full name
  aliases: array<string>           # Alternative names
  roles: array<string>             # Founder, etc.
  affiliation: string              # lab:fram_design
  location: { country }
  education: [{degree, institution}]
  experience: [{company, role, location, period, outcome}]
  contacts: {email, linkedin}
  contact_policy: {preferred, notes}
```

**Andrei Clodius Profile (163 lines):**
- Industrial Design degree from Politecnico di Milano
- Experience: HAX (China), Vector Watch (acquired by Fitbit), Fitbit, ING Bank, UiPath
- Founded FRAM Design in 2025
- Focus: AI-native product development, agent-owned interfaces
- Principles on design, technology, AI, art
- Answer patterns and communication style
- Personal notes (non-authoritative but informative)

### 4. **Prompt Loader System** (prompts/)

Modular prompt management replacing hardcoded strings:

**Structure:**
```
prompts/
├── README.md                       # Prompt authoring guide (70 lines)
├── core.md                         # Main system prompt (79 lines)
├── voice-behavior.md               # Voice-specific behavior (33 lines)
└── tools/
    ├── ignore_user.md              # Tool instructions (34 lines)
    └── end_voice_session.md        # Tool instructions (32 lines)
```

**Loader Implementation:**
- `lib/prompt-loader.ts` (52 lines) - Frontend loader
- `voice-server/prompt-loader.js` (62 lines) - Backend loader

**Features:**
- Loads markdown files from prompts/
- Concatenates sections based on mode
- Injects tool summaries dynamically
- Supports voice/text mode variations

**Example Usage:**
```typescript
import { loadPrompt } from '@/lib/prompt-loader';

const systemPrompt = await loadPrompt({
  mode: 'voice',
  includeSections: ['core', 'voice-behavior', 'tools/ignore_user']
});
```

### 5. **Provider Transport Layer** (voice-server/providers/)

Abstraction for different AI provider protocols:

**Files:**
- `transport-interface.js` (51 lines) - Base ToolTransport class
- `gemini-live-transport.js` (99 lines) - Gemini WebSocket transport
- `openai-transport.js` (89 lines) - OpenAI Realtime transport

**Purpose:** Abstract tool call/response format from provider specifics

**Gemini Live Transport:**
```javascript
class GeminiLiveTransport extends ToolTransport {
  parseToolCall(message) {
    // Gemini sends: { functionCalls: [{ name, args }] }
    return message.functionCalls.map(call => ({
      toolId: call.name,
      args: call.args
    }));
  }

  formatToolResponse(toolId, response) {
    // Gemini expects: { functionResponses: [{ name, response }] }
    return {
      functionResponses: [{
        name: toolId,
        response: response  // Full ToolResponse envelope
      }]
    };
  }
}
```

**OpenAI Realtime Transport:**
```javascript
class OpenAIRealtimeTransport extends ToolTransport {
  parseToolCall(message) {
    // OpenAI sends: response.function_call_arguments.done
    if (message.type === 'response.function_call_arguments.done') {
      return [{
        toolId: message.name,
        args: JSON.parse(message.arguments)
      }];
    }
  }

  formatToolResponse(toolId, response) {
    // OpenAI expects: conversation.item.create with function_call_output
    return {
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: this.callId,
        output: JSON.stringify(response)
      }
    };
  }
}
```

### 6. **Voice Server Refactor** (voice-server/)

**Modified Files:**
- `server.js` (167 line change, ~1,158 total) - Integrated tool registry
- `config.js` (140 line change) - Now uses prompt loader
- `ENV_VARIABLES.md` (3 line change) - Updated docs
- `INTEGRATION.md` (347 lines) - NEW comprehensive integration guide

**Key Changes:**
```javascript
// OLD: Hardcoded tools in server.js
const ignoreUserTool = {
  name: "ignore_user",
  description: "...",
  parameters: { /* inline schema */ }
};

// NEW: Tools from registry
import { toolRegistry } from '../tools/_core/registry.js';

await toolRegistry.load();
const providerSchemas = toolRegistry.getProviderSchemas('geminiNative');
```

### 7. **Chat API Integration** (app/api/chat/)

**New File:**
- `INTEGRATION.md` (412 lines) - Comprehensive integration guide for chat API

**Documentation includes:**
- How to integrate tool registry with chat endpoint
- Streaming response handling with tools
- Error handling patterns
- State management across turns
- Token budget considerations

### 8. **Dependencies Added**

**New Production Dependencies:**
```json
"ajv": "^8.17.1",              // JSON Schema validation
"ajv-formats": "^3.0.1"        // Format validators (email, date-time, etc.)
```

**Package.json Changes:**
```json
{
  "type": "module",             // ⚠️ BREAKING CHANGE - ES modules everywhere
  "scripts": {
    "build:tools": "node tools/_build/tool-builder.js",
    "prebuild": "npm run build:tools",     // Run before build
    "prestart": "npm run build:tools"      // Run before start
  }
}
```

### 9. **Comprehensive Documentation**

**Planning & Architecture:**
- `tool-reg-plan-FULL.md` (5,392 lines) - Complete planning document
- `.cursor/plans/tool_registry_architecture_628745f3.plan.md` (2,840 lines)
- `tools/ARCHITECTURE.md` (252 lines) - System architecture
- `tools/PHASES.md` (419 lines) - Implementation phases
- `tools/README.md` (554 lines) - Tool authoring guide
- `tools/_build/README.md` (243 lines) - Build process docs
- `IMPLEMENTATION_SUMMARY.md` (285 lines) - What was completed

**Integration Guides:**
- `app/api/chat/INTEGRATION.md` (412 lines) - Chat API integration
- `voice-server/INTEGRATION.md` (347 lines) - Voice server integration

**Total Documentation:** ~10,000+ lines

### 10. **Deleted Files**

**Removed (cleanup):**
- `ANALYTICS_SETUP.md` (197 lines)
- `DEPLOYMENT_CHECKLIST.md` (179 lines)
- `RAILWAY_DEPLOYMENT.md` (513 lines)
- `RAILWAY_QUICK_START.md` (97 lines)
- `VERCEL_ENV_SETUP.md` (174 lines)

**Total removed:** 1,160 lines of old docs

---

## What Broke Deployment

### 🔴 Critical Issue #1: ES Module Switch

**Change:**
```json
"type": "module"
```

**Impact:**
- **ALL `.js` files** now treated as ES modules (not CommonJS)
- **Next.js may break** if not configured for ES modules
- **Voice server breaks** if it has any CommonJS requires
- **Import/export syntax** must be consistent everywhere

**Symptoms:**
```
Error [ERR_REQUIRE_ESM]: require() of ES Module not supported
```

**Fix Required:**
1. Update Next.js config to handle ES modules
2. Convert all `require()` to `import`
3. Add `.js` extensions to all relative imports
4. Update voice-server to use ES modules consistently

### 🔴 Critical Issue #2: Prebuild Hooks

**Change:**
```json
"prebuild": "npm run build:tools",
"prestart": "npm run build:tools"
```

**Impact:**
- **Build fails** if `tools/_build/tool-builder.js` errors
- **Tool registry missing** if build doesn't run successfully
- **Deployment fails** if tools/ structure incomplete
- **Runtime crashes** if `tool_registry.json` doesn't exist

**Symptoms:**
```
Error: Cannot find module '/home/user/framdesign/tools/tool_registry.json'
```

**Fix Required:**
1. Ensure tools/ directory structure is complete
2. Run `npm run build:tools` manually and verify success
3. Add tool_registry.json to git (or generate in build)
4. Handle missing registry gracefully in production

### 🔴 Critical Issue #3: Tool Registry Integration Not Complete

**Problem:**
- Tool registry code exists in `tools/_core/registry.js`
- BUT: Not actually imported/used in `app/api/chat/route.ts`
- AND: Voice server may still have old tool definitions

**Current State:**
```typescript
// app/api/chat/route.ts still has OLD code:
const ignoreUserTool = {
  name: "ignore_user",
  description: "...",
  parameters: { /* hardcoded */ }
};
```

**Expected State:**
```typescript
// Should use registry:
import { toolRegistry } from '@/tools/_core/registry.js';
await toolRegistry.load();
const tools = toolRegistry.getProviderSchemas('geminiNative');
```

**Fix Required:**
1. Update `app/api/chat/route.ts` to use tool registry
2. Update `voice-server/server.js` to use tool registry
3. Remove old hardcoded tool definitions
4. Test tool execution with new registry

### 🔴 Critical Issue #4: Path Resolution

**Problem:**
- Tool handlers use dynamic imports: `import(tool.handlerPath)`
- Handler paths are file:// URLs: `file:///path/to/handler.js`
- May not work in production (Vercel, Railway)

**Symptoms:**
```
Error: Cannot find module 'file:///var/task/tools/ignore-user/handler.js'
```

**Fix Required:**
1. Use relative paths instead of file:// URLs
2. Test dynamic imports in production environment
3. Consider bundling handlers or using static imports

### 🔴 Critical Issue #5: Missing Dependencies in voice-server

**Problem:**
- Main package.json has `ajv` and `ajv-formats`
- BUT: voice-server has its own package.json
- Voice server needs these deps to load tool registry

**Fix Required:**
```bash
cd voice-server
npm install ajv ajv-formats
```

### ⚠️  Issue #6: Prompt Loader File System Access

**Problem:**
- Prompt loader reads from `prompts/` directory
- May not work in Vercel (serverless environment)
- File system access limited in production

**Fix Required:**
1. Bundle prompts at build time
2. Use static imports instead of file reads
3. Or use environment variables for prompts

---

## Architectural Assessment

### ✅ **Strengths:**

1. **Professional Architecture** - Enterprise-grade tool system
2. **Provider Agnostic** - Works with OpenAI, Gemini, others
3. **Build-Time Validation** - Catches errors before runtime
4. **Formal Contracts** - ToolResponse envelope, JSON Schema
5. **Comprehensive Docs** - 10,000+ lines of documentation
6. **Intent-Based State** - Clean separation of concerns
7. **Extensible** - Easy to add new tools

### ⚠️  **Concerns:**

1. **Massive Complexity** - 13,549 lines added
2. **Incomplete Integration** - Registry exists but not used
3. **ES Module Breaking Change** - `"type": "module"` breaks everything
4. **Build Pipeline Dependency** - Must run successfully
5. **File System Access** - May not work in serverless
6. **Dynamic Imports** - May fail in production
7. **Testing Gap** - No tests for new tool system

---

## What Needs to Happen Next

### Priority 1: Get It Working Locally

```bash
# 1. Install dependencies
npm install

# 2. Build tools
npm run build:tools

# 3. Verify registry generated
ls -la tools/tool_registry.json

# 4. Run dev server
npm run dev

# 5. Check for errors
```

### Priority 2: Fix ES Module Issues

**Option A: Keep ES Modules**
- Update all imports to include `.js` extensions
- Fix Next.js config for ES modules
- Test thoroughly

**Option B: Revert to CommonJS**
- Remove `"type": "module"`
- Convert ES imports back to require()
- Use `.mjs` extension for ES modules only

### Priority 3: Complete Integration

**Update Chat API:**
```typescript
// app/api/chat/route.ts
import { toolRegistry } from '@/tools/_core/registry.js';

let registryLoaded = false;

export async function POST(request: Request) {
  if (!registryLoaded) {
    await toolRegistry.load();
    registryLoaded = true;
  }

  const tools = toolRegistry.getProviderSchemas('geminiNative');
  // Use tools in Gemini API call
}
```

**Update Voice Server:**
```javascript
// voice-server/server.js
import { toolRegistry } from '../tools/_core/registry.js';

await toolRegistry.load();
console.log('Tool registry loaded:', toolRegistry.version);

const tools = toolRegistry.getProviderSchemas('geminiNative');
// Use in Gemini Live session
```

### Priority 4: Production Compatibility

1. **Bundle prompts at build time** - Don't read files at runtime
2. **Static import handlers** - Or use relative paths, not file:// URLs
3. **Add tool_registry.json to git** - Or generate reliably in CI/CD
4. **Test in production-like environment** - Vercel preview, Railway staging

### Priority 5: Incremental Rollout

**Phase 1: Get build working**
- Fix ES module issues
- Get `npm run build` to succeed
- Verify tool_registry.json generates

**Phase 2: Integrate registry (no new tools yet)**
- Use registry for existing tools (ignore_user, end_voice_session)
- Remove old hardcoded tool definitions
- Test in development

**Phase 3: Test in production**
- Deploy to staging environment
- Test voice and chat with tools
- Monitor for errors

**Phase 4: Add new tools**
- Once stable, create new tools (kb_search, etc.)
- Test incrementally
- Deploy to production

---

## Deployment Strategy

### Recommended Approach: Incremental

**Step 1: Feature Flag**
```typescript
const USE_TOOL_REGISTRY = process.env.USE_TOOL_REGISTRY === 'true';

if (USE_TOOL_REGISTRY) {
  await toolRegistry.load();
  tools = toolRegistry.getProviderSchemas('geminiNative');
} else {
  // Use old hardcoded tools
  tools = [ignoreUserTool, startVoiceSessionTool];
}
```

**Step 2: Deploy with Flag OFF**
- Deploy new code but don't use registry yet
- Verify nothing breaks
- Old tools still work

**Step 3: Enable in Staging**
- Set `USE_TOOL_REGISTRY=true` in staging
- Test thoroughly
- Fix any issues

**Step 4: Enable in Production**
- Gradual rollout
- Monitor error rates
- Rollback if needed

---

## Why This Broke Deployment

### Root Cause Analysis:

1. **`"type": "module"` was added** without updating all imports
2. **Prebuild hooks added** but build may have failed silently
3. **Tool registry created** but never integrated into chat/voice code
4. **Dynamic file system access** doesn't work in serverless (Vercel)
5. **Missing dependencies** in voice-server package.json
6. **No gradual rollout** - tried to deploy everything at once

### Timeline of Breakage:

1. Commit `2a00744`: "created new KB" - Added kb/ structure
2. Commit `5093ccc`: "Update package-lock.json" - Added ajv dependencies
3. Commit `3e1c908`: "tool updated" - Added `"type": "module"`, prebuild hooks
4. Deploy attempted → **FAILED**
5. Rolled back to form branch → Site working but no features

---

## Summary

This was a **massive architectural refactor** that introduced:
- ✅ **Tool Registry System** - Enterprise-grade tool management
- ✅ **Knowledge Base** - Structured user information
- ✅ **Prompt Loader** - Modular prompt system
- ✅ **Provider Abstraction** - Multi-AI support
- ❌ **Breaking Change** - `"type": "module"` broke everything
- ❌ **Incomplete** - Registry exists but not used
- ❌ **Untested** - No tests for new system

**The work is excellent** but needs:
1. Fix ES module issues
2. Complete integration (use the registry!)
3. Test in production environment
4. Incremental deployment with feature flags
5. Monitoring and rollback plan

**Not a bad architecture** - just needs careful rollout! 🚀
