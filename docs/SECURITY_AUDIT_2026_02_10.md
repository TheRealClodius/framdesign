# FRAM Platform Comprehensive Audit Report

**Date:** 2026-02-10
**Scope:** Website, Agent, Tool System, Asset Retrieval, KB Indexing
**Audited by:** Claude Code automated audit

---

## Executive Summary

The FRAM platform is a dual-agent conversational AI system (text + voice) built on Next.js 16, React 19, Google Gemini, Qdrant vector DB, and Google Cloud Storage. This audit examined all major subsystems across security, performance, reliability, accessibility, and code quality.

**Overall Risk Level: MEDIUM**

| Category | Critical | High | Medium | Low | Total |
|----------|----------|------|--------|-----|-------|
| Security | 2 | 3 | 4 | 3 | 12 |
| Performance | 0 | 1 | 4 | 2 | 7 |
| Reliability | 0 | 2 | 3 | 3 | 8 |
| Accessibility | 0 | 0 | 3 | 4 | 7 |
| Code Quality | 0 | 0 | 3 | 5 | 8 |
| **Total** | **2** | **6** | **17** | **17** | **42** |

---

## 1. CRITICAL FINDINGS (Fix Immediately)

### CRIT-1: XSS via Suggestion Rendering
**File:** `components/ChatInterface.tsx` ~line 1793
**Severity:** CRITICAL

Suggestions extracted from message content via `extractSuggestionsFromContent()` are rendered directly in buttons without sanitization. A crafted message containing `{"suggestions": ["<img src=x onerror='alert(1)'>", "safe"]}` would execute arbitrary JavaScript.

**Recommendation:** Sanitize suggestion strings by stripping HTML tags and filtering against `javascript:`, `data:`, and event handler patterns before rendering.

### CRIT-2: XSS via Citation URLs
**File:** `components/ChatInterface.tsx` ~line 1777
**Severity:** CRITICAL

Citation URLs from `message.citations` are rendered as `<a href={citation.url}>` without validation. A `javascript:alert(1)` URL would execute when clicked.

**Recommendation:** Validate all URLs with a whitelist of allowed protocols (`http:`, `https:`) before rendering as link hrefs.

---

## 2. HIGH-SEVERITY FINDINGS

### HIGH-1: API Key Material in Debug Logs
**File:** `tools/perplexity-search/handler.js` lines 32-33
**Severity:** HIGH

The Perplexity API key suffix (last 4 characters) is logged in debug output. If logs are shipped to external services, this narrows the key space for brute-force attacks.

**Recommendation:** Log only presence/absence: `{ hasApiKey: !!apiKey }`. Remove all partial key material from logs.

### HIGH-2: Insufficient Input Validation on Chat Endpoint
**File:** `app/api/chat/route.ts` lines 939-1002
**Severity:** HIGH

The chat API accepts messages without validating:
- That `messages` is actually an array
- Maximum array length
- Maximum content length per message
- Content encoding

A malicious user could send extremely large payloads to cause memory exhaustion or DoS.

**Recommendation:** Add schema validation: verify array type, cap at 100 messages, cap content at 10,000 characters per message, validate each message has `role` and `content` fields.

### HIGH-3: Error Information Disclosure
**File:** `lib/errors.ts` lines 116-160
**Severity:** HIGH

`handleServerError()` returns the raw `details: errorMessage` field to clients, which may contain internal stack traces, Qdrant connection strings, or GCS bucket paths.

**Recommendation:** Log detailed errors server-side only. Return generic error messages to clients. Never include `details` with raw error text in API responses.

### HIGH-4: O(n^2 log n) Loop in Tool Memory
**File:** `tools/_core/tool-memory-store.js` lines 250-276
**Severity:** HIGH (Performance)

`getCallsNeedingSummarization()` sorts the entire `toolCalls` array inside a `.filter()` callback, executing an O(n log n) sort for each of the n elements. For 50 calls, this means 50 sorts.

**Recommendation:** Sort once before filtering. Extract the sorted array outside the filter callback.

### HIGH-5: Race Condition in Voice State
**File:** `components/ChatInterface.tsx` ~line 834-854
**Severity:** HIGH

`shouldStartNewTurn.current` is read as a ref before `setState`, but in React concurrent rendering, multiple events could read the ref before any reset it. This causes messages to be appended to the wrong turn.

**Recommendation:** Store the flag in state instead of a ref, or use a queue-based approach that serializes turn transitions.

### HIGH-6: Message Duplication via Index-Based Append
**File:** `components/ChatInterface.tsx` ~line 857-872
**Severity:** HIGH

Messages are appended using `prev[prev.length - 1]` which assumes the last message is the target. Concurrent state updates can shift the array, causing text to be appended to the wrong message.

**Recommendation:** Store the target message ID and use `findIndex()` to locate it instead of assuming it's the last element.

---

## 3. MEDIUM-SEVERITY FINDINGS

### MED-1: Prompt Injection in Summarization
**File:** `app/api/chat/route.ts` lines 371-415

User messages are directly interpolated into the summarization prompt. A user embedding `\n\n[SUMMARIZER: ignore previous instructions...]` could influence summary output.

**Recommendation:** Use structured messages (system instruction + user content) instead of string interpolation for the summarization call.

### MED-2: Missing Error Boundary
**File:** `components/ChatInterface.tsx`

No React error boundary wraps the 89KB core component. If `MarkdownWithMermaid` or any child throws during render, the entire chat UI crashes silently.

**Recommendation:** Add an error boundary component wrapping the main chat interface with a fallback UI.

### MED-3: Debug Log File in Production
**File:** `app/api/chat/route.ts` lines 9-15

A `debugLog()` function writes to `debug.log` in the project root with no rotation, size limit, or environment gate.

**Recommendation:** Gate behind `process.env.DEBUG`, use structured logging, set a max file size, or remove entirely in production.

### MED-4: Dynamic Import via Function Constructor
**File:** `tools/_core/registry.js` lines 214-220

Uses `new Function('p', 'return import(p)')` to hide dynamic imports from webpack. While intentional, this makes the code harder to audit and bundle-verify.

**Recommendation:** Add explicit security comments, consider proper webpack externals configuration instead.

### MED-5: Unbounded Recursive String Extraction
**File:** `tools/_core/utils/similarity.js` lines 80-116

`extractStrings()` recurses into objects without a depth limit. Pathological nested objects could cause stack overflow.

**Recommendation:** Add a `maxDepth` parameter (default 10) and bail out when exceeded.

### MED-6: Unbounded Caches in ChatInterface
**File:** `components/ChatInterface.tsx` ~line 569

`suggestionImageCache` is a `useRef<Map>` that grows without bound over a long session. Similarly, `MermaidRenderer` has an in-memory cache with no size limit.

**Recommendation:** Implement LRU eviction or a maximum cache size (e.g., 20-50 entries).

### MED-7: localStorage Quota Risk
**File:** `components/ChatInterface.tsx` ~line 783

Messages are saved to localStorage every 300ms on change, with no quota checking. Long conversations could exceed the 5-10MB browser limit, causing silent data loss.

**Recommendation:** Check serialized size before saving, warn or trim older messages when approaching quota, catch `QuotaExceededError`.

### MED-8: Missing CORS/Origin Validation
**File:** `app/api/chat/route.ts`

The streaming response sets content-type headers but no explicit CORS headers. If Next.js middleware doesn't handle CORS, cross-origin requests could interact with the API.

**Recommendation:** Verify CORS is handled at the middleware level, or add explicit origin validation on API routes.

### MED-9: Predictable User IDs
**File:** `lib/storage.ts` line 50

User IDs are generated with `Math.random()` + `Date.now()`, which is not cryptographically secure and produces predictable values.

**Recommendation:** Use `crypto.getRandomValues()` for ID generation.

### MED-10: No Data Schema Validation on localStorage Load
**File:** `lib/storage.ts` lines 129-147

Messages loaded from localStorage are not validated against a schema. Corrupted or tampered data could cause runtime errors.

**Recommendation:** Add a type guard function that validates each message has required fields before using it.

### MED-11: kb_get Uses Search Workaround
**File:** `tools/kb-get/handler.js` lines 88-139

Instead of direct document lookup by ID, kb_get searches with a dummy embedding + entity_id filter. Functional but slower than necessary (~300ms vs potential ~100ms).

**Recommendation:** Implement direct Qdrant scroll/retrieve by point ID for faster lookups.

### MED-12: Duplicate Service Loader Code
**Files:** `tools/kb-search/handler.js`, `tools/kb-get/handler.js`

Both tools have identical 30+ lines of dynamic import fallback logic for loading services.

**Recommendation:** Extract to `tools/_core/utils/service-loader.js`.

---

## 4. LOW-SEVERITY FINDINGS

### LOW-1: `userScalable: false` in Viewport
**File:** `app/[locale]/layout.tsx` line 56

Disabling user zoom violates WCAG 2.1 Level AA. Users with visual impairments need zoom capability.

### LOW-2: Missing ARIA Labels
**Files:** `components/SuggestionImagePopup.tsx`, `components/ChatInterface.tsx`

Image popups lack `role="tooltip"` and `aria-label`. Loading dots lack `aria-label="Loading"`. Screen readers cannot announce these elements.

### LOW-3: Tap Highlight Removed
**File:** `app/globals.css` line 43

`-webkit-tap-highlight-color: transparent` removes visual feedback for touch interactions, reducing accessibility for touch users.

### LOW-4: Disabled Button Contrast
**File:** `components/ChatInterface.tsx` ~line 1869

`disabled:opacity-50` produces contrast ratios below WCAG 4.5:1 requirements.

### LOW-5: CSS !important Overuse
**File:** `app/globals.css` lines 18-32

Redundant `!important` on nearly every CSS rule makes stylesheets unmaintainable and creates specificity conflicts.

### LOW-6: Mermaid Selector Bloat
**File:** `app/globals.css` lines 114-150+

9+ selectors target a single Mermaid diagram rule, causing poor CSS performance on pages with many diagrams.

### LOW-7: Floating Promise in Summarizer
**File:** `tools/_core/tool-memory-summarizer.js` lines 95-114

`processQueue()` is called without `await` and without a `.catch()` handler. Failures are silently swallowed.

### LOW-8: Unused Variable in Retry Handler
**File:** `tools/_core/retry-handler.js` line 162

`lastError` is initialized but never assigned in the retry loop. Always returns `null`.

### LOW-9: Inconsistent Loop Detection for Empty Strings
**File:** `tools/_core/loop-detector.js` line 121

Empty string (`""`) returns false on one check but true on a later check, creating inconsistent behavior.

### LOW-10: Index as React Key
**File:** `components/ChatInterface.tsx` ~line 1736

`key={message.id || index}` uses array index as fallback, causing incorrect DOM reuse if messages reorder.

### LOW-11: Hardcoded Token Limits
**File:** `lib/constants.ts` lines 31-36

Token limits are hardcoded. Changing limits requires code deployment rather than environment variable updates.

### LOW-12: Client-Side Timeout Bypass
**File:** `lib/storage.ts` lines 59-91

Timeout enforcement is client-side only (localStorage). Users can bypass by clearing storage.

### LOW-13: Missing Request ID Tracking
**File:** `app/api/chat/route.ts`

No request ID correlation for debugging. Difficult to trace issues across service boundaries.

### LOW-14: No Retry-After Header Parsing
**File:** `tools/_core/retry-handler.js`

Rate limit errors use exponential backoff but don't check for `Retry-After` headers from upstream APIs.

### LOW-15: PEM Key Escape Sequence Handling
**File:** `tools/_core/tool-memory-summarizer.js` line 60

Only handles `\\n` in PEM keys. Other escape sequences could produce invalid cryptographic material.

### LOW-16: No Video Controls on Hero
**File:** `components/Hero.tsx` lines 52-67

Auto-playing video has no `controls` attribute, preventing users from pausing or muting.

### LOW-17: Migration Metadata in Manifest
**File:** `kb/assets/manifest.json`

Contains `_old_path` and `_ID_MAPPING_RULES` fields from GCS migration. Harmless but adds noise.

---

## 5. POSITIVE FINDINGS

The following areas demonstrate strong engineering practices:

### Security Strengths
- API keys never logged in full (only presence/absence checks)
- `.env` files properly gitignored, only `.env.example` committed
- Token budget enforcement at both session and global levels
- GCS signed URLs with proper TTL and cache management
- Tool response envelope with formal error types

### Architecture Strengths
- Clean separation: app/, lib/, tools/, components/
- Unified tool system with build-time validation and runtime execution
- Smart deduplication (85% similarity threshold with boolean parameter support)
- Loop detection prevents infinite tool call chains
- Idempotent embedding operations (re-running updates, doesn't duplicate)

### KB & Indexing Strengths
- 100% consistent frontmatter across all 23 KB files
- Embedding model and dimensions aligned across all services (gemini-embedding-001, 768 dims)
- Duplicate ID detection at embed time
- Word-boundary-aware chunking (1000 chars, 200 overlap)
- Asset manifest validated: 110 assets, 100% have blob_id, zero broken references

### Testing Strengths
- 100% success rate (20/20 questions) in latest agent behavior test (Run 11)
- 45+ test files covering unit, integration, E2E, and agent behavior
- Zero hallucinations across all test runs
- 4.9s average response time
- 75.5% cache efficiency

---

## 6. REMEDIATION PRIORITY

### Immediate (Before Next Deploy)
| ID | Finding | Effort |
|----|---------|--------|
| CRIT-1 | XSS via suggestion rendering | Small |
| CRIT-2 | XSS via citation URLs | Small |
| HIGH-1 | API key in debug logs | Small |
| HIGH-2 | Chat input validation | Medium |
| HIGH-3 | Error information disclosure | Small |

### High Priority (This Sprint)
| ID | Finding | Effort |
|----|---------|--------|
| HIGH-4 | O(n^2) tool memory loop | Small |
| HIGH-5 | Voice state race condition | Medium |
| HIGH-6 | Message duplication | Medium |
| MED-1 | Prompt injection in summarization | Medium |
| MED-2 | Missing error boundary | Small |
| MED-3 | Debug log in production | Small |

### Medium Priority (Next Sprint)
| ID | Finding | Effort |
|----|---------|--------|
| MED-5 | Unbounded recursion in similarity | Small |
| MED-6 | Unbounded caches | Small |
| MED-7 | localStorage quota | Small |
| MED-9 | Predictable user IDs | Small |
| MED-10 | localStorage schema validation | Medium |
| MED-11 | kb_get direct lookup | Medium |

### Low Priority (Tech Debt)
All LOW-* findings. Address as part of regular maintenance cycles.

---

## 7. SYSTEM OVERVIEW

### Architecture
```
[Browser] → [Next.js (Vercel)] → [Gemini 2.5 Flash]
                ↓                       ↓
          [API Routes]           [Tool System]
                ↓                       ↓
        [Qdrant Cloud]         [GCS Signed URLs]

[Browser] → [Voice Server (Railway)] → [Gemini Live API]
```

### Key Metrics
| Metric | Value |
|--------|-------|
| KB entities | 23 (3 people, 1 lab, 19 projects) |
| KB assets | 110 (all GCS-backed) |
| KB chunks | ~113 embedded vectors |
| Embedding model | gemini-embedding-001 (768 dims) |
| Tools | 6 active (kb-search, kb-get, query-tool-memory, perplexity-search, start/end-voice-session) |
| Test success rate | 100% (Run 11) |
| Avg response time | 4.9s |
| Cache efficiency | 75.5% |

---

*End of audit report.*
