# Fram Design Embeddings + Agent Retrieval/Recommendation Review (Second Pass)

**Date:** 2026-03-04  
**Author:** Codex review (second pass)

---

## Executive summary

Fram’s retrieval stack is now in a materially stronger state than in the first-pass review.

The major previously-identified architectural debts have been addressed:

- `kb_get` now performs **direct entity retrieval** via `getByEntityId()` (Qdrant scroll + `entity_id` filter), removing the dummy-embedding + `topK` workaround.
- Vector point IDs moved from 32-bit hashing to **deterministic UUID v5**, sharply reducing collision risk.
- Recommendation support evolved from prose-only hints to include a **structured `recommendation_candidates` array** with scoring and rationale.
- Tool-failure instructions in the chain path now explicitly enforce **user-safe error messaging** (no raw internals shown).

At this point, the system looks like a production-grade semantic retrieval stack with practical guardrails for failures and iterative discovery. The remaining opportunities are less about correctness and more about optimization, consistency, and measurable recommendation quality over time.

---

## Scope and method

This second pass focused on:

1. Embedding generation and indexing architecture.
2. Retrieval semantics in `kb_search` and `kb_get`.
3. Agent recovery behavior (retries, loop protection, relevance gating, memory recall).
4. Recommendation strategy and where ranking logic currently lives.
5. Delta from first-pass findings.

Primary files reviewed:

- `lib/services/embedding-service.ts`
- `lib/services/vector-store-service.ts`
- `scripts/Embed/embed-kb.ts`
- `tools/kb-search/handler.js`
- `tools/kb-get/handler.js`
- `app/api/chat/route.ts`
- `prompts/core.md`
- `tools/kb-search/guide.md`
- `tools/kb-get/guide.md`
- `docs/KB_EMBEDDING.md`

---

## 1) Embeddings architecture review

### 1.1 Current model strategy

You are consistently using:

- **Model:** `gemini-embedding-001`
- **Dimension:** `768`
- **Provider config:** API-key flow (`vertexai: false`) for deterministic runtime behavior

This consistency is clearly enforced in both runtime query embedding (`embedding-service`) and ingestion (`embed-kb.ts`).

### 1.2 Ingestion pipeline quality

The embedding ingestion flow remains disciplined:

- recursive markdown discovery under `kb/` (excluding README docs)
- deterministic chunking with overlap and boundary heuristics
- deterministic chunk IDs (`{entity_id}_chunk_{index}`)
- idempotent Qdrant upsert behavior
- metadata flattening with explicit exclusion of conflicting `id`

This is good operational design: re-runnable, deterministic, and easy to reason about.

### 1.3 ID and storage strategy (improved)

A key improvement since first pass:

- point IDs are now generated via **UUID v5** from string IDs in a fixed namespace.

That preserves deterministic mapping while eliminating the high-concern 32-bit collision profile. This is one of the most meaningful hardening wins in the current revision.

### 1.4 Remaining embedding-layer considerations

No urgent correctness issues, but still worth tracking:

1. **Single-provider dependency:** ingestion and query embeddings still rely on Gemini availability + quotas.
2. **Character-based chunking ceiling:** works well for many docs, but long narrative docs may benefit from token/sentence-aware segmentation.
3. **Backfill and re-embedding observability:** there is solid tooling, but long-term drift checks (e.g., model version transitions) could be formalized further.

---

## 2) Retrieval behavior (`kb_search`, `kb_get`)

### 2.1 `kb_search`: strong and feature-rich

`kb_search` now looks mature for production usage:

- Mode-aware result clamping (`voice <= 3`, text <= 10)
- Explicit query embedding generation + error classification (auth/rate-limit/timeout/transient)
- Search fan-out before dedupe (`searchLimit = max(topK*3, 15)`)
- Entity-level dedupe by best-scoring chunk
- Filter mapping (`type -> entity_type`, `related_to -> related_entities contains`)
- Asset-aware enrichment:
  - stable asset references
  - dead-asset detection
  - optional image payload for top visual result (text mode)
- Relationship awareness:
  - `_assetHints` for top non-asset entities
  - `_allAssets` for full inventory awareness with `related_to`
- Structured recommendation output:
  - `recommendation_candidates[]` with score + rationale + asset counts

The retrieval layer is no longer just “vector search”; it is now orchestration-aware for narrative and visual storytelling.

### 2.2 `kb_get`: major debt retired

`kb_get` now correctly aligns with its tool contract:

- direct retrieval by entity ID
- no embedding generation
- no arbitrary topK cap
- chunk reconstruction for text entities
- asset-specific behavior (stable refs, dead-asset diagnostics, optional image bytes)

This directly removes the largest issue from the first pass and should positively affect latency and determinism.

### 2.3 Retrieval stack caveats worth monitoring

1. **`_allAssets` truncation in response payload** (sliced to top 20 in output) can still underrepresent very large asset sets in edge cases.
2. **Related-asset hint sample** depends partly on semantic search previews; count is corrected via `countByFilter`, but sample composition may skew toward semantically similar visuals rather than diverse ones.
3. **Potential fetch overhead** when resolving blob status and optional image payloads under high concurrency.

None are correctness blockers; they are mostly quality/performance tuning opportunities.

---

## 3) Agent recovery behavior

### 3.1 Recovery mechanisms present

The recovery architecture has multiple independent safeguards:

- **Retry framework** with exponential backoff + jitter for retryable failures.
- **Mode-aware retry policy** (voice mode constrained to preserve latency budget).
- **Loop detection** for repeated tool calls within the same turn/session pattern.
- **Relevance gating** (`areKbResultsRelevant`) to avoid low-value KB chaining.
- **Tool memory store** with session TTL and recent-call recall.
- **Conversation lifecycle hygiene** (new-session memory clearing behavior in route flow).

This layered approach is a notable strength: failures can degrade gracefully without silent infinite loops.

### 3.2 Error policy consistency (improved)

In this pass, the prompt-level and route-level behavior are substantially better aligned:

- prompt rules: do not expose raw tool errors.
- runtime instruction for failed tools: tell user plain-language failure, explicitly hide raw internals.

This resolves a major trust/UX inconsistency from earlier behavior.

### 3.3 Remaining recovery risks

1. **Cross-turn repetition despite loop detection:** the detector is strong for hard loops, but softer “semantic repetition” (same outcome through slightly different query phrasing) can still happen.
2. **Voice-mode no-retry policy tradeoff:** necessary for latency, but it can slightly reduce resilience on transient upstream failures.
3. **Tool-memory growth profile:** bounded per session and TTL-based, but worth watching in very high parallel session volume.

---

## 4) Recommendation behavior (how the agent suggests next steps)

### 4.1 Current recommendation layers

Recommendation generation is now distributed across four cooperating layers:

1. **Prompt policy (`prompts/core.md`)**
   - Exactly two suggestions in exploration-friendly responses.
   - Preference for KB-grounded, narrative deepening.

2. **Tool guide policy (`tools/kb-search/guide.md`)**
   - Explicit use of `recommendation_candidates` top scorers for follow-up selection.

3. **Tool output structure (`kb_search`)**
   - Scored recommendation candidates with rationale and asset counts.

4. **Tool output prose (`_instructions`)**
   - Supplemental nudges (asset usage, dead-asset warnings, suggestion strategy hints).

This is a strong evolution from first pass: recommendations now have a machine-readable core.

### 4.2 Recommendation scoring quality

Current composite scoring combines:

- raw relevance score weight
- positional factor
- type diversity bonus (first-seen type)
- asset-availability bonus

It is pragmatic and simple, which is a good starting point. It is not yet user-feedback-optimized, but it is transparent and inspectable.

### 4.3 Recommendation gaps to close next

1. **No longitudinal diversity memory** (e.g., avoid recommending same entity family repeatedly across turns unless requested).
2. **No explicit novelty-vs-relevance knob** by user intent (“show me something different” vs “go deeper”).
3. **No offline recommendation quality benchmark** with fixed eval sets and metrics.

---

## 5) First-pass delta: what changed

| First-pass concern | Current status | Notes |
|---|---|---|
| `kb_get` used dummy embedding + topK workaround | ✅ Resolved | Direct `getByEntityId()` retrieval now in place |
| 32-bit hash ID collision risk | ✅ Resolved | Deterministic UUID v5 mapping implemented |
| Recommendation logic mostly prose hints | 🟨 Partially resolved | Structured `recommendation_candidates` added; still mixed with prose `_instructions` |
| Error-policy contradiction on raw error visibility | ✅ Resolved | Route instructions now reinforce plain-language error handling |

Net: the platform materially improved between passes.

---

## 6) Priority action plan (second-pass)

### P0 (high confidence / high return)

1. **Add retrieval+recommendation eval harness** with stable query sets and scoring rubrics.
   - Track relevance, diversity, redundancy, and follow-up engagement proxies.
2. **Instrument recommendation decision telemetry** (candidate IDs + selected suggestions + user follow-up).
   - Enables tuning beyond intuition.

### P1

3. **Introduce recommendation diversity memory per session** to reduce repetitive suggestions.
4. **Expose intent-aware recommendation mode** (`deepen`, `broaden`, `contrast`) and reflect in candidate ranking.
5. **Unify recommendation instruction channel** so structured fields are primary and prose hints are strictly secondary.

### P2

6. **Upgrade chunking strategy** for long docs (sentence/token-aware chunking + heading affinity).
7. **Optional hybrid retrieval** (semantic + lexical) for exact-name lookups and short sparse queries.
8. **Performance tuning for visual-heavy flows** (cache blob existence checks, tighter image fetch constraints).

---

## 7) KPI framework for next iteration

Recommended measurements after P0/P1:

1. **Retrieval quality**
   - first-tool-hit usefulness rate
   - answer groundedness on KB factual queries
2. **Recommendation quality**
   - suggestion acceptance rate
   - unique entity coverage over N turns
   - repeated suggestion suppression success
3. **Recovery quality**
   - retry success rate (text mode)
   - loop-guard intervention rate
   - user-visible failure clarity (no raw internals leakage target: 0)
4. **Performance**
   - `kb_search` and `kb_get` p50/p95 latency
   - visual-analysis path p95 with `include_image_data`

---

## Final assessment

Fram’s embeddings/retrieval/recommendation architecture is now in a strong state. The platform has moved from “good foundation with a few structural debts” to “operationally solid with optimization opportunities.”

Most of the remaining work is about **systematic quality tuning** (evaluation, diversity control, telemetry-driven ranking) rather than fixing fundamental design flaws.

That is a good place to be.
