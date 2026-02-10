# FRAM Audit TODO

Findings from the comprehensive audit on 2026-02-10.
Full report: [`docs/SECURITY_AUDIT_2026_02_10.md`](docs/SECURITY_AUDIT_2026_02_10.md)

---

## Immediate (Before Next Deploy)

- [ ] **CRIT-1 — XSS via suggestion rendering** `components/ChatInterface.tsx:~1793`
  Sanitize suggestion strings (strip HTML tags, block `javascript:`, `data:`, event handlers) before rendering in buttons.

- [ ] **CRIT-2 — XSS via citation URLs** `components/ChatInterface.tsx:~1777`
  Validate citation URLs against an allowed-protocol whitelist (`http:`, `https:`) before rendering as `<a href>`.

- [ ] **HIGH-1 — API key material in debug logs** `tools/perplexity-search/handler.js:32-33`
  Replace partial key logging with `{ hasApiKey: !!apiKey }`.

- [ ] **HIGH-2 — Insufficient input validation on chat endpoint** `app/api/chat/route.ts:939-1002`
  Add schema validation: verify `messages` is an array, cap at 100 messages, cap content at 10k chars, require `role` + `content`.

- [ ] **HIGH-3 — Error information disclosure** `lib/errors.ts:116-160`
  Stop returning raw `details` to clients. Log full errors server-side; return generic messages to the browser.

---

## High Priority (This Sprint)

- [ ] **HIGH-4 — O(n^2 log n) loop in tool memory** `tools/_core/tool-memory-store.js:250-276`
  Sort the `toolCalls` array once before the `.filter()` call instead of sorting inside it.

- [ ] **HIGH-5 — Race condition in voice state** `components/ChatInterface.tsx:~834-854`
  Replace `shouldStartNewTurn` ref with React state or a serialized queue to prevent concurrent-render issues.

- [ ] **HIGH-6 — Message duplication via index-based append** `components/ChatInterface.tsx:~857-872`
  Look up the target message by ID (`findIndex`) instead of assuming it's `prev[prev.length - 1]`.

- [ ] **MED-1 — Prompt injection in summarization** `app/api/chat/route.ts:371-415`
  Use structured Gemini messages (system instruction + user content) instead of string interpolation.

- [ ] **MED-2 — Missing error boundary** `components/ChatInterface.tsx`
  Wrap the chat UI in a React error boundary with a fallback UI.

- [ ] **MED-3 — Debug log file in production** `app/api/chat/route.ts:9-15`
  Gate `debugLog()` behind `process.env.DEBUG`, add size rotation, or remove entirely.

---

## Medium Priority (Next Sprint)

- [ ] **MED-4 — Dynamic import via Function constructor** `tools/_core/registry.js:214-220`
  Add security comments; consider proper webpack externals instead of `new Function('p', 'return import(p)')`.

- [ ] **MED-5 — Unbounded recursive string extraction** `tools/_core/utils/similarity.js:80-116`
  Add a `maxDepth` parameter (default 10) to `extractStrings()`.

- [ ] **MED-6 — Unbounded caches in ChatInterface** `components/ChatInterface.tsx:~569`
  Add LRU eviction or a max size (20-50 entries) to `suggestionImageCache` and MermaidRenderer cache.

- [ ] **MED-7 — localStorage quota risk** `components/ChatInterface.tsx:~783`
  Check serialized size before saving, catch `QuotaExceededError`, warn or trim when approaching quota.

- [ ] **MED-8 — Missing CORS/Origin validation** `app/api/chat/route.ts`
  Verify CORS is handled at middleware level or add explicit origin validation on API routes.

- [ ] **MED-9 — Predictable user IDs** `lib/storage.ts:50`
  Replace `Math.random()` + `Date.now()` with `crypto.getRandomValues()`.

- [ ] **MED-10 — No schema validation on localStorage load** `lib/storage.ts:129-147`
  Add a type guard that validates each message has required fields before use.

- [ ] **MED-11 — kb_get uses search workaround** `tools/kb-get/handler.js:88-139`
  Implement direct Qdrant scroll/retrieve by point ID (~100ms vs current ~300ms).

- [ ] **MED-12 — Duplicate service loader code** `tools/kb-search/handler.js`, `tools/kb-get/handler.js`
  Extract shared dynamic-import fallback logic to `tools/_core/utils/service-loader.js`.

---

## Low Priority (Tech Debt)

- [ ] **LOW-1 — `userScalable: false` in viewport** `app/[locale]/layout.tsx:56`
  Remove or set to `true` to comply with WCAG 2.1 Level AA.

- [ ] **LOW-2 — Missing ARIA labels** `components/SuggestionImagePopup.tsx`, `components/ChatInterface.tsx`
  Add `role="tooltip"` + `aria-label` to image popups; add `aria-label="Loading"` to loading dots.

- [ ] **LOW-3 — Tap highlight removed** `app/globals.css:43`
  Remove `-webkit-tap-highlight-color: transparent` or replace with a visible focus style.

- [ ] **LOW-4 — Disabled button contrast** `components/ChatInterface.tsx:~1869`
  Replace `disabled:opacity-50` with a style that meets WCAG 4.5:1 contrast.

- [ ] **LOW-5 — CSS !important overuse** `app/globals.css:18-32`
  Remove redundant `!important` declarations and fix specificity at the selector level.

- [ ] **LOW-6 — Mermaid selector bloat** `app/globals.css:114-150+`
  Consolidate 9+ selectors targeting a single Mermaid rule into one.

- [ ] **LOW-7 — Floating promise in summarizer** `tools/_core/tool-memory-summarizer.js:95-114`
  Add `.catch()` to `processQueue()` call or `await` it.

- [ ] **LOW-8 — Unused variable in retry handler** `tools/_core/retry-handler.js:162`
  Remove unused `lastError` variable.

- [ ] **LOW-9 — Inconsistent loop detection for empty strings** `tools/_core/loop-detector.js:121`
  Normalize empty-string handling to return a consistent result.

- [ ] **LOW-10 — Index as React key** `components/ChatInterface.tsx:~1736`
  Generate stable IDs for all messages so the `index` fallback in `key={message.id || index}` is never needed.

- [ ] **LOW-11 — Hardcoded token limits** `lib/constants.ts:31-36`
  Make token limits configurable via environment variables.

- [ ] **LOW-12 — Client-side timeout bypass** `lib/storage.ts:59-91`
  Enforce timeout server-side as well (usage-service already partially does this).

- [ ] **LOW-13 — Missing request ID tracking** `app/api/chat/route.ts`
  Generate a unique request ID per chat request and thread it through logs for traceability.

- [ ] **LOW-14 — No Retry-After header parsing** `tools/_core/retry-handler.js`
  Parse `Retry-After` headers from upstream APIs instead of always using fixed exponential backoff.

- [ ] **LOW-15 — PEM key escape sequence handling** `tools/_core/tool-memory-summarizer.js:60`
  Handle additional escape sequences beyond `\\n` when parsing PEM keys.

- [ ] **LOW-16 — No video controls on hero** `components/Hero.tsx:52-67`
  Add `controls` attribute to auto-playing hero video.

- [ ] **LOW-17 — Migration metadata in manifest** `kb/assets/manifest.json`
  Remove `_old_path` and `_ID_MAPPING_RULES` fields now that GCS migration is complete.
