# FRAM Codebase Refactoring Plan

## Overview

This document outlines 10 independent refactoring chapters that can be executed **in parallel** by separate agents. Each chapter targets specific files with no overlap, enabling concurrent development on the same branch.

**Total Expected Reduction**: ~4,100 lines (18% of codebase)

**Branch**: `claude/document-app-architecture-u4QP6`

---

## Dependency Graph

```
Chapter 1 (scripts)     ─┐
Chapter 2 (summarizer)  ─┤
Chapter 4 (mermaid)     ─┤
Chapter 6 (localStorage)─┼──► Can run fully in parallel
Chapter 8 (metrics)     ─┤
Chapter 9 (voice scripts)┤
Chapter 10 (memory-store)┘

Chapter 3 (tool helpers) ──► Run after Chapter 2 completes
Chapter 5 (asset-url)    ──► Run after Chapter 4 completes
Chapter 7 (chat route)   ──► Run after Chapter 3 completes
```

**Safe parallel execution**: Chapters 1, 2, 4, 6, 8, 9, 10 have zero file overlap.

---

## Chapter 1: Delete Duplicate Scripts

**Agent Scope**: `/scripts/` root-level duplicates only

**Lines Removed**: ~700

### Files to DELETE

```bash
# These are duplicates of files in subdirectories
scripts/embed-kb.ts                    # duplicate of Embed/embed-kb.ts
scripts/test-search.ts                 # duplicate of Testing/kb/test-search.ts
scripts/test-kb-tools.ts               # duplicate of Testing/kb/test-kb-tools.ts
scripts/test-qdrant-connection.js      # duplicate of .ts version
scripts/deploy-voice-server.sh         # duplicate of Deployment/prod/
scripts/test-integration.sh            # duplicate of Testing/integration/
```

### Files to UPDATE

**`scripts/README.md`** - Remove references to deleted files, update paths to canonical locations.

### Verification

```bash
# Ensure canonical versions still work
npx tsx scripts/Embed/embed-kb.ts --help
npx tsx scripts/Testing/kb/test-search.ts
npx tsx scripts/Testing/kb/test-kb-tools.ts
npx tsx scripts/test-qdrant-connection.ts
./scripts/Deployment/prod/deploy-voice-server.sh --help
./scripts/Testing/integration/test-integration.sh --help
```

### Success Criteria
- [ ] 6 duplicate files deleted
- [ ] README.md updated with correct paths
- [ ] All canonical scripts still function

---

## Chapter 2: Remove tool-memory-summarizer.js

**Agent Scope**: `/tools/_core/tool-memory-summarizer.js` and references

**Lines Removed**: ~400 (363 in summarizer + scattered references)

### Files to DELETE

```
tools/_core/tool-memory-summarizer.js   # Entire file (363 lines)
```

### Files to UPDATE

**`tools/_core/tool-memory-store.js`** - Remove summarizer integration:

```javascript
// REMOVE these imports (around line 5-10)
- import { toolMemorySummarizer } from './tool-memory-summarizer.js';

// REMOVE summarization calls in recordToolCall() (around line 60-80)
- // Queue for async summarization if beyond threshold
- if (this.calls.length > SUMMARIZE_THRESHOLD) {
-   toolMemorySummarizer.queueForSummarization(sessionId, call);
- }

// REMOVE summary field handling throughout
// Just keep: id, toolId, args, timestamp, fullResponse, ok, error
```

**`app/api/chat/route.ts`** - Remove summarizer import if present:

```typescript
// REMOVE if exists (around line 30)
- import { toolMemorySummarizer } from '@/tools/_core/tool-memory-summarizer';
```

### Verification

```bash
npm run build
npm test
# Verify tool memory still works without summaries
node -e "
  const { toolMemoryStore } = require('./tools/_core/tool-memory-store.js');
  toolMemoryStore.recordToolCall('test', { id: '1', toolId: 'kb_search', args: {}, timestamp: Date.now(), fullResponse: {ok:true}, ok: true });
  console.log(toolMemoryStore.getRecentCalls('test'));
"
```

### Success Criteria
- [ ] tool-memory-summarizer.js deleted
- [ ] tool-memory-store.js works without summaries
- [ ] Build passes
- [ ] No references to summarizer remain

---

## Chapter 3: Create Shared Tool Helpers

**Agent Scope**: New file + updates to tool handlers

**Lines Removed**: ~200 (duplication across handlers)

**Depends on**: Chapter 2 (summarizer removal)

### Files to CREATE

**`tools/_core/helpers.js`** (new file, ~80 lines):

```javascript
/**
 * Shared helper functions for tool handlers
 * Eliminates duplication across kb-search, kb-get, and other tools
 */

/**
 * Import a module with fallback for bundled vs unbundled environments
 */
export async function importWithFallback(aliasPath, relativePath) {
  try {
    return await import(aliasPath);
  } catch {
    return await import(/* webpackIgnore: true */ relativePath);
  }
}

/**
 * Extract HTTP status code from various error formats
 */
export function extractHttpStatus(error) {
  if (error?.status) return error.status;
  if (error?.response?.status) return error.response.status;
  const match = error?.message?.match(/status[:\s]*(\d{3})/i);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Check if error indicates service unavailable (503)
 */
export function isServiceUnavailable(error) {
  const status = extractHttpStatus(error);
  return status === 503 || error?.message?.toLowerCase().includes('service unavailable');
}

/**
 * Load blob storage service with environment fallback
 */
export async function loadBlobService() {
  const mod = await importWithFallback(
    '@/lib/services/blob-storage-service',
    '../../lib/services/blob-storage-service.js'
  );
  return mod.resolveBlobUrl || mod.default?.resolveBlobUrl;
}

/**
 * Generate markdown for an asset (image or video)
 */
export function generateAssetMarkdown(type, url, caption = '') {
  const safeCaption = caption || 'Asset';
  if (['video', 'mov', 'mp4', 'webm'].some(t => type?.toLowerCase().includes(t))) {
    return `<video controls src="${url}" title="${safeCaption}">Video: ${safeCaption}</video>`;
  }
  return `![${safeCaption}](${url})`;
}

/**
 * Extract relevant metadata, excluding internal fields
 */
export function extractRelevantMetadata(metadata, additionalExcludes = []) {
  const defaultExcludes = ['id', 'vector', 'text', 'file_path', 'chunk_index', 'total_chunks', 'entity_id'];
  const excludeSet = new Set([...defaultExcludes, ...additionalExcludes]);

  const result = {};
  for (const [key, value] of Object.entries(metadata || {})) {
    if (!excludeSet.has(key) && value !== undefined && value !== null) {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Normalize entity ID (lowercase, handle prefixes)
 */
export function normalizeEntityId(id) {
  if (!id) return null;
  const normalized = String(id).toLowerCase().trim();
  // Handle "type:id" format
  if (normalized.includes(':')) {
    return normalized.split(':').pop();
  }
  return normalized;
}
```

### Files to UPDATE

**`tools/kb-search/index.js`** - Replace duplicated functions with imports:

```javascript
// ADD at top
import {
  importWithFallback,
  extractHttpStatus,
  isServiceUnavailable,
  loadBlobService,
  generateAssetMarkdown,
  extractRelevantMetadata
} from '../_core/helpers.js';

// REMOVE local implementations of:
// - extractHttpStatus() (~10 lines)
// - isServiceUnavailable() (~5 lines)
// - loadBlobService() (~25 lines)
// - The import fallback try/catch blocks (~40 lines)
```

**`tools/kb-get/index.js`** - Same updates as kb-search.

### Verification

```bash
npm run build
npm test
# Test kb-search still works
node -e "
  const { toolRegistry } = require('./tools/_core/registry.js');
  toolRegistry.executeTool('kb_search', { args: { query: 'test' } }).then(console.log);
"
```

### Success Criteria
- [ ] helpers.js created with 6 exported functions
- [ ] kb-search/index.js uses helpers (removes ~100 lines)
- [ ] kb-get/index.js uses helpers (removes ~100 lines)
- [ ] All tool tests pass

---

## Chapter 4: Simplify Mermaid Sanitization

**Agent Scope**: `/components/MermaidRenderer.tsx` only

**Lines Removed**: ~144 (179 → 35)

### Files to UPDATE

**`components/MermaidRenderer.tsx`** - Replace `sanitizeMermaidSource` function:

```typescript
// REPLACE the entire sanitizeMermaidSource function (lines ~38-179)
// with this simplified version:

/**
 * Sanitize Mermaid source code
 * Handles: markdown fences, duplicate declarations, garbage before diagram
 */
function sanitizeMermaidSource(source: string): string {
  // Strip markdown fences
  let s = source.replace(/^```(?:mermaid)?\s*\n?|\n?```\s*$/gi, '').trim();

  const lines = s.split('\n');
  const diagramPattern = /^(graph|flowchart|timeline|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gantt|pie|gitGraph|sankey)/i;

  let foundDiagram = false;
  let diagramType: string | null = null;

  const result: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    const match = trimmed.match(diagramPattern);

    if (match) {
      // Skip duplicate declarations of same type
      if (diagramType && match[1].toLowerCase() === diagramType.toLowerCase()) {
        continue;
      }
      diagramType = match[1];
      foundDiagram = true;
    }

    // Skip lines before first diagram declaration
    if (!foundDiagram) continue;

    // Skip empty lines at the very start
    if (result.length === 0 && !trimmed) continue;

    result.push(line);
  }

  // Clean up trailing empty lines
  while (result.length > 0 && !result[result.length - 1].trim()) {
    result.pop();
  }

  return result.join('\n');
}
```

### Verification

```bash
npm run build
npm run dev
# Manually test with various Mermaid diagrams in chat:
# - flowchart with ```mermaid fences
# - timeline diagram
# - sequence diagram
# - diagram with garbage text before declaration
```

### Test Cases to Verify

```typescript
// Test 1: Basic cleanup
sanitizeMermaidSource('```mermaid\ngraph TD\nA-->B\n```')
// Expected: 'graph TD\nA-->B'

// Test 2: Duplicate declaration
sanitizeMermaidSource('graph TD\nA-->B\ngraph TD\nC-->D')
// Expected: 'graph TD\nA-->B'

// Test 3: Garbage before diagram
sanitizeMermaidSource('some random text\nmore garbage\ngraph TD\nA-->B')
// Expected: 'graph TD\nA-->B'
```

### Success Criteria
- [ ] sanitizeMermaidSource reduced from 179 to ~35 lines
- [ ] All existing Mermaid diagrams still render
- [ ] Edge cases (fences, duplicates, garbage) still handled
- [ ] Build passes

---

## Chapter 5: Unify URL/Asset Handling

**Agent Scope**: New lib file + component updates

**Lines Removed**: ~110

**Depends on**: Chapter 4 (to avoid component conflicts)

### Files to CREATE

**`lib/utils/asset-url.ts`** (new file, ~50 lines):

```typescript
/**
 * Unified asset URL handling utilities
 * Consolidates duplicate logic from MarkdownWithMermaid and ChatInterface
 */

const GCS_HOST = 'storage.googleapis.com';
const LOCAL_PREFIX = '/kb-assets/';

export interface AssetInfo {
  blobId: string;
  extension: string;
}

/**
 * Parse an asset URL (GCS or local) to extract blob ID and extension
 */
export function parseAssetUrl(input: string): AssetInfo | null {
  if (!input) return null;

  let filename: string;

  // Handle GCS URLs
  if (input.includes(GCS_HOST)) {
    try {
      const url = new URL(input);
      const pathParts = url.pathname.split('/');
      filename = decodeURIComponent(pathParts[pathParts.length - 1] || '');
    } catch {
      return null;
    }
  }
  // Handle local /kb-assets/ paths
  else if (input.includes('kb-assets')) {
    filename = input.replace(/^\/?(kb-assets\/)?/, '');
  }
  else {
    return null;
  }

  const dotIndex = filename.lastIndexOf('.');
  if (dotIndex === -1) return null;

  return {
    blobId: filename.slice(0, dotIndex),
    extension: filename.slice(dotIndex + 1)
  };
}

/**
 * Normalize an asset path to standard /kb-assets/ format
 */
export function normalizeAssetPath(src: string): string {
  if (!src) return src;
  if (src.startsWith('http://') || src.startsWith('https://')) return src;

  // Remove leading slash and kb-assets prefix, then re-add consistently
  const clean = src.replace(/^\/?(kb-assets\/)?/, '');
  return `${LOCAL_PREFIX}${clean}`;
}

/**
 * Refresh an expired GCS signed URL
 */
export async function refreshAssetUrl(blobId: string, extension: string): Promise<string | null> {
  try {
    const response = await fetch('/api/refresh-asset-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blob_id: blobId, extension })
    });

    if (!response.ok) return null;

    const data = await response.json();
    return data.url || null;
  } catch {
    return null;
  }
}
```

### Files to UPDATE

**`components/MarkdownWithMermaid.tsx`** - Replace local functions with imports:

```typescript
// ADD at top
import { parseAssetUrl, normalizeAssetPath, refreshAssetUrl } from '@/lib/utils/asset-url';

// REMOVE these local function definitions:
// - extractBlobIdFromGcsUrl() (~30 lines)
// - extractBlobIdFromLocalAssetPath() (~20 lines)
// - normalizeImagePath() (~25 lines)
// - The inline refreshGcsUrl logic

// UPDATE usages to use imported functions:
// parseAssetUrl() replaces both extractBlobIdFrom* functions
// normalizeAssetPath() replaces normalizeImagePath()
// refreshAssetUrl() replaces inline fetch logic
```

### Verification

```bash
npm run build
npm run dev
# Test image loading in chat:
# - GCS-hosted images
# - Local /kb-assets/ images
# - Expired URL refresh (may need to simulate)
```

### Success Criteria
- [ ] asset-url.ts created with 3 exported functions
- [ ] MarkdownWithMermaid.tsx uses new utilities
- [ ] ~110 lines removed from components
- [ ] Image/video loading still works

---

## Chapter 6: Consolidate localStorage Handling

**Agent Scope**: `/lib/storage.ts` only

**Lines Removed**: ~100 (182 → 80)

### Files to UPDATE

**`lib/storage.ts`** - Refactor with unified accessor:

```typescript
// ADD this helper at the top (after STORAGE_KEYS)

/**
 * Safe localStorage wrapper that handles SSR (server-side rendering)
 */
const safeStorage = {
  get(key: string): string | null {
    if (typeof window === 'undefined') return null;
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },

  set(key: string, value: string): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(key, value);
    } catch {
      // Storage full or unavailable
    }
  },

  remove(key: string): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.removeItem(key);
    } catch {
      // Ignore errors
    }
  },

  getJSON<T>(key: string, fallback: T): T {
    const value = this.get(key);
    if (!value) return fallback;
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  },

  setJSON(key: string, value: unknown): void {
    this.set(key, JSON.stringify(value));
  }
};

// REFACTOR all existing functions to use safeStorage:

// BEFORE (repeated 9 times):
export function getUserId(): string {
  if (typeof window === "undefined") return DEFAULT_USER_ID;
  try {
    return localStorage.getItem(STORAGE_KEYS.USER_ID) || DEFAULT_USER_ID;
  } catch {
    return DEFAULT_USER_ID;
  }
}

// AFTER:
export function getUserId(): string {
  return safeStorage.get(STORAGE_KEYS.USER_ID) || DEFAULT_USER_ID;
}

// BEFORE:
export function getMessages(): Message[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.MESSAGES);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

// AFTER:
export function getMessages(): Message[] {
  return safeStorage.getJSON(STORAGE_KEYS.MESSAGES, []);
}

// Apply same pattern to ALL functions:
// - getTimeoutUntil, setTimeoutUntil, clearTimeoutUntil
// - setMessages, clearMessages
// - getTheme, setTheme
// - etc.
```

### Verification

```bash
npm run build
npm run dev
# Test in browser:
# - Messages persist across refresh
# - Theme preference persists
# - User ID persists
# - Timeout state persists
```

### Success Criteria
- [ ] safeStorage helper added
- [ ] All 9 functions refactored to use it
- [ ] ~100 lines of repetitive code removed
- [ ] All localStorage functionality still works

---

## Chapter 7: Unify Tool Execution in Chat Route

**Agent Scope**: `/app/api/chat/route.ts` tool execution section

**Lines Removed**: ~240

**Depends on**: Chapter 3 (tool helpers)

### Files to UPDATE

**`app/api/chat/route.ts`** - Extract generic tool executor:

```typescript
// ADD this function (around line 500, before the POST handler):

interface ToolExecutionContext {
  conversationHash: string;
  messages: RawMessage[];
  sessionId: string;
  observability?: ObservabilityData;
}

interface ToolExecutionResult {
  ok: boolean;
  data?: unknown;
  error?: { type: string; message: string; retryable: boolean; details?: unknown };
  duration: number;
}

/**
 * Execute a tool with standard recording, retry, and observability
 */
async function executeToolWithContext(
  toolName: string,
  args: Record<string, unknown>,
  thoughtSignature: string | undefined,
  ctx: ToolExecutionContext
): Promise<ToolExecutionResult> {
  const turnNumber = Math.ceil(ctx.messages.length / 2);
  const state = createStateController({ mode: 'text', isActive: true }) as StateController;

  // Record tool call
  recordToolCall(ctx.conversationHash, turnNumber, toolName, args, thoughtSignature, 0);

  const toolMetadata = toolRegistry.getToolMetadata(toolName) as ToolMetadata | null;

  const executionContext = {
    clientId: `text-${Date.now()}`,
    ws: null,
    geminiSession: null,
    args,
    capabilities: { voice: false },
    session: {
      isActive: state.get('isActive'),
      toolsVersion: toolRegistry.getVersion(),
      state: state.getSnapshot()
    },
    meta: {
      perplexityApiKey: process.env.PERPLEXITY_API_KEY
    }
  };

  const startTime = Date.now();

  // Check for loops
  const loopCheck = loopDetector.detectLoop(ctx.sessionId, turnNumber, toolName, args);
  if (loopCheck.detected) {
    const duration = Date.now() - startTime;
    recordToolResult(ctx.conversationHash, turnNumber, toolName,
      { error: true, type: 'LOOP_DETECTED', message: loopCheck.message, retryable: false }, 0);
    return { ok: false, error: { type: 'LOOP_DETECTED', message: loopCheck.message, retryable: false }, duration };
  }

  loopDetector.recordCall(ctx.sessionId, turnNumber, toolName, args, null);

  // Execute with retry
  const result = await retryToolExecution(
    () => toolRegistry.executeTool(toolName, executionContext),
    { mode: 'text', maxRetries: 3, toolId: toolName, toolMetadata: toolMetadata || {} }
  );

  const duration = Date.now() - startTime;

  // Record result
  recordToolResult(ctx.conversationHash, turnNumber, toolName,
    result.ok ? (result.data as Record<string, unknown>) :
    { error: true, type: result.error.type, message: result.error.message, retryable: result.error.retryable },
    0);

  // Record observability
  if (ctx.observability) {
    ctx.observability.toolCalls.push({
      position: ctx.observability.toolCalls.length + 1,
      chainPosition: 0,
      toolId: toolName,
      args,
      thoughtSignature,
      startTime,
      duration,
      ok: result.ok,
      result: result.ok ? result.data : null,
      error: result.ok ? null : result.error
    });
    ctx.observability.totalDuration = Date.now() - ctx.observability.requestStartTime;
  }

  // Audit log
  console.log(JSON.stringify({
    event: 'tool_execution',
    toolId: toolName,
    toolVersion: toolMetadata?.version || 'unknown',
    duration,
    ok: result.ok,
    mode: 'text'
  }));

  return { ...result, duration };
}

// THEN replace the 3 separate tool handling blocks with:

// Handle function calls
if (functionCalls.length > 0) {
  const call = functionCalls[0];
  const part = functionCallParts[0];

  const ctx: ToolExecutionContext = { conversationHash, messages, sessionId: userId || 'anonymous', observability };
  const result = await executeToolWithContext(call.name, call.args || {}, part?.thoughtSignature, ctx);

  // Special handling for specific tools
  if (call.name === 'ignore_user') {
    if (result.ok) {
      return NextResponse.json({
        message: (result.data as any).farewellMessage,
        timeout: { duration: (result.data as any).durationSeconds, until: (result.data as any).timeoutUntil }
      });
    }
    return NextResponse.json({ error: result.error?.message }, { status: 500 });
  }

  if (call.name === 'start_voice_session') {
    if (result.ok) {
      return NextResponse.json({
        message: extractBufferedText(bufferedChunks) || "Let's switch to voice mode.",
        startVoiceSession: true,
        pendingRequest: call.args?.pending_request || null
      });
    }
    return NextResponse.json({ error: result.error?.message }, { status: 500 });
  }

  // For other tools, continue conversation with result...
  // (rest of existing logic for building updatedContents)
}
```

### Verification

```bash
npm run build
npm run dev
# Test various tool calls:
# - kb_search query
# - kb_get entity lookup
# - ignore_user (if testable)
# - Verify observability data still collected
```

### Success Criteria
- [ ] executeToolWithContext function created (~60 lines)
- [ ] Three separate 100-line blocks consolidated
- [ ] ~240 lines removed
- [ ] All tool execution still works correctly

---

## Chapter 8: Simplify metrics.js

**Agent Scope**: `/tools/_core/metrics.js` only

**Lines Removed**: ~350 (556 → 200)

### Files to UPDATE

**`tools/_core/metrics.js`** - Replace parallel Maps with single structure:

```javascript
// REPLACE the entire file with this simplified version:

/**
 * Simplified tool metrics collection
 * Uses single data structure instead of 8 parallel Maps
 */

const MAX_SAMPLES = 100;

class ToolMetrics {
  constructor() {
    this.samples = [];
  }

  record(execution) {
    this.samples.push({
      timestamp: Date.now(),
      duration: execution.duration,
      ok: execution.ok,
      errorType: execution.error?.type || null,
      responseSize: execution.responseSize || 0,
      tokenEstimate: execution.tokenEstimate || 0,
      budgetViolation: execution.budgetViolation || false
    });

    // Keep only last MAX_SAMPLES
    if (this.samples.length > MAX_SAMPLES) {
      this.samples.shift();
    }
  }

  getSummary() {
    if (this.samples.length === 0) {
      return { count: 0, avgDuration: 0, errorRate: 0, p50: 0, p95: 0, p99: 0 };
    }

    const durations = this.samples.map(s => s.duration).sort((a, b) => a - b);
    const errors = this.samples.filter(s => !s.ok).length;

    return {
      count: this.samples.length,
      avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
      errorRate: errors / this.samples.length,
      p50: durations[Math.floor(durations.length * 0.5)] || 0,
      p95: durations[Math.floor(durations.length * 0.95)] || 0,
      p99: durations[Math.floor(durations.length * 0.99)] || 0,
      budgetViolations: this.samples.filter(s => s.budgetViolation).length,
      recentErrors: this.samples.filter(s => !s.ok).slice(-5).map(s => s.errorType)
    };
  }
}

class MetricsCollector {
  constructor() {
    this.tools = new Map(); // toolId -> ToolMetrics
    this.globalStats = { totalCalls: 0, startTime: Date.now() };
  }

  getToolMetrics(toolId) {
    if (!this.tools.has(toolId)) {
      this.tools.set(toolId, new ToolMetrics());
    }
    return this.tools.get(toolId);
  }

  recordExecution(toolId, execution) {
    this.getToolMetrics(toolId).record(execution);
    this.globalStats.totalCalls++;
  }

  recordDuration(toolId, duration) {
    this.recordExecution(toolId, { duration, ok: true });
  }

  recordError(toolId, error, duration = 0) {
    this.recordExecution(toolId, { duration, ok: false, error });
  }

  recordBudgetViolation(toolId, duration, budgetMs) {
    this.recordExecution(toolId, { duration, ok: true, budgetViolation: true });
  }

  getSummary() {
    const toolSummaries = {};
    for (const [toolId, metrics] of this.tools) {
      toolSummaries[toolId] = metrics.getSummary();
    }

    return {
      uptime: Date.now() - this.globalStats.startTime,
      totalCalls: this.globalStats.totalCalls,
      tools: toolSummaries
    };
  }

  // Compatibility methods for existing code
  recordLatency(toolId, duration) {
    this.recordDuration(toolId, duration);
  }

  getLatencyStats(toolId) {
    return this.getToolMetrics(toolId).getSummary();
  }
}

// Export singleton instance
export const metrics = new MetricsCollector();

// Named exports for compatibility
export const recordLatency = (toolId, duration) => metrics.recordLatency(toolId, duration);
export const recordError = (toolId, error) => metrics.recordError(toolId, error);
export const recordBudgetViolation = (toolId, duration, budget) => metrics.recordBudgetViolation(toolId, duration, budget);
export const getLatencyStats = (toolId) => metrics.getLatencyStats(toolId);
export const getSummary = () => metrics.getSummary();
```

### Verification

```bash
npm run build
# Test metrics collection
node -e "
  const { metrics, recordLatency, getSummary } = require('./tools/_core/metrics.js');
  recordLatency('kb_search', 150);
  recordLatency('kb_search', 200);
  recordLatency('kb_search', 180);
  console.log(JSON.stringify(getSummary(), null, 2));
"
```

### Success Criteria
- [ ] 8 parallel Maps replaced with single structure
- [ ] ToolMetrics class handles per-tool data
- [ ] MetricsCollector provides same API
- [ ] ~350 lines removed
- [ ] Existing callers still work

---

## Chapter 9: Consolidate Voice Monitoring Scripts

**Agent Scope**: `/scripts/` voice monitoring shell scripts

**Lines Removed**: ~80 (130 → 50)

### Files to DELETE

```bash
scripts/check-voice-logs.sh       # 35 lines
scripts/monitor-voice-logs.sh     # 62 lines
scripts/monitor-voice-simple.sh   # 33 lines
```

### Files to CREATE

**`scripts/monitor-voice.sh`** (new file, ~50 lines):

```bash
#!/bin/bash
# Unified voice server monitoring script
# Usage: ./monitor-voice.sh [--snapshot|--simple|--detailed]

set -e

MODE="${1:---simple}"
VOICE_SERVER_LOG="${VOICE_SERVER_LOG:-/var/log/voice-server.log}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

highlight_tools() {
  while IFS= read -r line; do
    if echo "$line" | grep -q '"toolId":"kb_search"'; then
      echo -e "${GREEN}[KB-SEARCH]${NC} $line"
    elif echo "$line" | grep -q '"toolId":"kb_get"'; then
      echo -e "${BLUE}[KB-GET]${NC} $line"
    elif echo "$line" | grep -q '"error"'; then
      echo -e "${RED}[ERROR]${NC} $line"
    elif echo "$line" | grep -q 'tool_execution'; then
      echo -e "${YELLOW}[TOOL]${NC} $line"
    else
      echo "$line"
    fi
  done
}

case "$MODE" in
  --snapshot|-s)
    echo "=== Voice Server Logs (last 100 lines) ==="
    tail -100 "$VOICE_SERVER_LOG" 2>/dev/null | highlight_tools || \
      railway logs --tail 100 2>/dev/null | highlight_tools || \
      echo "Could not read voice server logs"
    ;;

  --simple)
    echo "=== Monitoring Voice Server (simple) ==="
    echo "Press Ctrl+C to stop"
    tail -f "$VOICE_SERVER_LOG" 2>/dev/null | highlight_tools || \
      railway logs --tail 50 2>/dev/null | highlight_tools || \
      echo "Could not tail voice server logs"
    ;;

  --detailed|-d)
    echo "=== Monitoring Voice Server (detailed) ==="
    echo "Press Ctrl+C to stop"
    tail -f "$VOICE_SERVER_LOG" 2>/dev/null | while IFS= read -r line; do
      # Try to parse JSON and format nicely
      if echo "$line" | grep -q '^{'; then
        echo "$line" | python3 -c "
import sys, json
try:
  d = json.loads(sys.stdin.read())
  if 'toolId' in d:
    print(f\"[{d.get('event', 'TOOL')}] {d['toolId']} - {d.get('duration', '?')}ms - ok={d.get('ok', '?')}\")
  else:
    print(json.dumps(d, indent=2))
except:
  pass
" 2>/dev/null || echo "$line"
      else
        highlight_tools <<< "$line"
      fi
    done || railway logs -f 2>/dev/null | highlight_tools
    ;;

  --help|-h)
    echo "Usage: $0 [--snapshot|--simple|--detailed]"
    echo ""
    echo "Modes:"
    echo "  --snapshot, -s   Show last 100 lines (read-only)"
    echo "  --simple         Real-time monitoring with highlighting (default)"
    echo "  --detailed, -d   Real-time with JSON parsing"
    echo ""
    echo "Environment:"
    echo "  VOICE_SERVER_LOG  Path to log file (default: /var/log/voice-server.log)"
    ;;

  *)
    echo "Unknown mode: $MODE"
    echo "Use --help for usage information"
    exit 1
    ;;
esac
```

### Files to UPDATE

**`scripts/README.md`** - Update monitoring section:

```markdown
## Voice Server Monitoring

```bash
# Snapshot of recent logs
./scripts/monitor-voice.sh --snapshot

# Real-time simple monitoring (default)
./scripts/monitor-voice.sh

# Real-time detailed monitoring with JSON parsing
./scripts/monitor-voice.sh --detailed
```
```

### Verification

```bash
chmod +x scripts/monitor-voice.sh
./scripts/monitor-voice.sh --help
# Test each mode (may need voice server running)
```

### Success Criteria
- [ ] 3 scripts deleted
- [ ] 1 unified script created
- [ ] All 3 modes work (snapshot, simple, detailed)
- [ ] README updated

---

## Chapter 10: Simplify tool-memory-store.js

**Agent Scope**: `/tools/_core/tool-memory-store.js` only

**Lines Removed**: ~200 (341 → 140)

**Note**: This chapter assumes Chapter 2 is complete (summarizer removed).

### Files to UPDATE

**`tools/_core/tool-memory-store.js`** - Simplify to basic FIFO:

```javascript
/**
 * Simplified tool memory store
 * Keeps last N tool calls per session, FIFO eviction
 */

const MAX_CALLS_PER_SESSION = 50;
const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour

class ToolMemoryStore {
  constructor() {
    this.sessions = new Map(); // sessionId -> { calls: [], lastAccess: timestamp }
  }

  /**
   * Get or create session
   */
  getSession(sessionId) {
    this.cleanup(); // Lazy cleanup on access

    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, { calls: [], lastAccess: Date.now() });
    }

    const session = this.sessions.get(sessionId);
    session.lastAccess = Date.now();
    return session;
  }

  /**
   * Record a tool call
   */
  recordToolCall(sessionId, call) {
    const session = this.getSession(sessionId);

    session.calls.push({
      id: call.id || `call-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      toolId: call.toolId,
      args: call.args,
      timestamp: call.timestamp || Date.now(),
      duration: call.duration,
      fullResponse: call.fullResponse,
      ok: call.ok,
      error: call.error
    });

    // FIFO eviction
    while (session.calls.length > MAX_CALLS_PER_SESSION) {
      session.calls.shift();
    }
  }

  /**
   * Get recent calls for a session
   */
  getRecentCalls(sessionId, limit = 10) {
    const session = this.sessions.get(sessionId);
    if (!session) return [];

    return session.calls.slice(-limit);
  }

  /**
   * Get full response for a specific call
   */
  getFullResponse(sessionId, callId) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const call = session.calls.find(c => c.id === callId);
    return call?.fullResponse || null;
  }

  /**
   * Get calls by tool ID
   */
  getCallsByTool(sessionId, toolId, limit = 10) {
    const session = this.sessions.get(sessionId);
    if (!session) return [];

    return session.calls
      .filter(c => c.toolId === toolId)
      .slice(-limit);
  }

  /**
   * Clean up expired sessions
   */
  cleanup() {
    const now = Date.now();
    for (const [sessionId, session] of this.sessions) {
      if (now - session.lastAccess > SESSION_TTL_MS) {
        this.sessions.delete(sessionId);
      }
    }
  }

  /**
   * Get session statistics
   */
  getStats(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const calls = session.calls;
    const toolCounts = {};

    for (const call of calls) {
      toolCounts[call.toolId] = (toolCounts[call.toolId] || 0) + 1;
    }

    return {
      totalCalls: calls.length,
      toolBreakdown: toolCounts,
      oldestCall: calls[0]?.timestamp,
      newestCall: calls[calls.length - 1]?.timestamp
    };
  }
}

// Export singleton
export const toolMemoryStore = new ToolMemoryStore();
```

### Verification

```bash
npm run build
node -e "
  const { toolMemoryStore } = require('./tools/_core/tool-memory-store.js');

  // Test recording
  toolMemoryStore.recordToolCall('session1', {
    toolId: 'kb_search',
    args: { query: 'test' },
    fullResponse: { ok: true, data: { results: [] } },
    ok: true
  });

  // Test retrieval
  console.log('Recent calls:', toolMemoryStore.getRecentCalls('session1'));
  console.log('Stats:', toolMemoryStore.getStats('session1'));
"
```

### Success Criteria
- [ ] Complex window policy removed
- [ ] Summary-related code removed
- [ ] Simple FIFO eviction implemented
- [ ] ~200 lines removed
- [ ] All existing functionality preserved

---

## Execution Checklist

### Before Starting
- [ ] All agents on branch `claude/document-app-architecture-u4QP6`
- [ ] `npm install` completed
- [ ] `npm run build` passes initially

### Parallel Execution (Wave 1)
- [ ] Chapter 1: Delete duplicate scripts
- [ ] Chapter 2: Remove tool-memory-summarizer
- [ ] Chapter 4: Simplify Mermaid sanitization
- [ ] Chapter 6: Consolidate localStorage
- [ ] Chapter 8: Simplify metrics.js
- [ ] Chapter 9: Consolidate voice monitoring scripts
- [ ] Chapter 10: Simplify tool-memory-store

### Sequential Execution (Wave 2)
- [ ] Chapter 3: Create shared tool helpers (after Chapter 2)
- [ ] Chapter 5: Unify URL/asset handling (after Chapter 4)
- [ ] Chapter 7: Unify tool execution (after Chapter 3)

### Final Verification
- [ ] `npm run build` passes
- [ ] `npm test` passes
- [ ] `npm run dev` starts successfully
- [ ] Manual smoke test of chat functionality

---

## Expected Results

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| Total lines | ~22,335 | ~18,200 | -18% |
| Files | 100+ | 90+ | -10% |
| Duplicate code | ~2,000 lines | ~200 lines | -90% |
| Build time | baseline | faster | improved |
| Cognitive load | high | lower | improved |
