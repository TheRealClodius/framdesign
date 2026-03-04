# Fram Design Embeddings + Agent Retrieval/Recommendation Review

**Date:** 2026-03-04  
**Author:** Codex review

## Executive summary

Fram’s current retrieval stack is well-structured and production-minded: a single embedding model (`gemini-embedding-001`, 768-dim), Qdrant-backed semantic search, entity-level deduping, robust asset handling, and explicit tool guides that push KB-first behavior. The agent also has meaningful recovery scaffolding (tool retries, relevance checks, loop detection, and tool-memory recall).

The biggest functional gaps are:

1. **`kb_get` still uses a dummy embedding + `searchSimilar(topK=100)` workaround** instead of direct ID retrieval, which adds avoidable latency and could miss very high-chunk entities.
2. **Recommendation behavior is partially split across prompt policy and tool-side `_instructions` hints**, which creates uneven outcomes and makes ranking strategy hard to reason about centrally.
3. **Error-handling policy is internally inconsistent**: prompt rules say “never expose raw errors,” while one chain-path injects an instruction to quote tool errors verbatim.
4. **ID hashing to 32-bit integers introduces collision risk** as corpus growth continues.

Overall maturity: **strong baseline with clear opportunities for precision, consistency, and scalability hardening**.

---

## Review scope and method

This review focused on:

- Embedding creation and storage lifecycle
- Retrieval flow (`kb_search`, `kb_get`) for text and assets
- Agent recovery patterns during failed/low-quality retrieval
- How recommendation/discovery is currently generated and guided

Primary files inspected:

- `scripts/Embed/embed-kb.ts`
- `lib/services/embedding-service.ts`
- `lib/services/vector-store-service.ts`
- `tools/kb-search/handler.js`
- `tools/kb-get/handler.js`
- `app/api/chat/route.ts`
- `prompts/core.md`
- `tools/kb-search/guide.md`
- `tools/kb-get/guide.md`
- `docs/KB_EMBEDDING.md`

---

## 1) Embeddings: current architecture review

## 1.1 What is working well

- **Model consistency is explicit across ingestion + query paths.**
  - Embeddings use `gemini-embedding-001` with fixed output dimensionality `768` both in embedding service and embedding script.
- **Ingestion is idempotent by design.**
  - Chunk IDs are deterministic (`{entity_id}_chunk_{index}`), and Qdrant `upsert` allows safe re-runs.
- **Metadata design supports retrieval use-cases.**
  - `entity_id`, `entity_type`, and `related_entities` are indexed and used for filtering.
- **Assets are first-class in the same vector index.**
  - Asset text representations include title/description/tags/relationship context and carry storage metadata (`blob_id`, extension).

## 1.2 Key implementation details and implications

### Chunking strategy

- Character-based chunking (1000 chars, 200 overlap), with word-boundary heuristics.
- Pros: simple, deterministic, stable operationally.
- Tradeoff: may split semantically meaningful boundaries compared with token/sentence-aware chunkers.

### Metadata flattening

- Complex frontmatter values are serialized where needed.
- `id` is intentionally excluded from metadata to avoid overwriting document IDs.
- This is a critical and correctly-enforced guardrail.

### ID strategy in Qdrant

- String IDs are converted to 32-bit numeric point IDs via hash; original string ID is stored in payload.
- This works but introduces **non-zero collision risk** as index size grows and complicates direct point retrieval semantics.

## 1.3 Embedding-layer risks

1. **Hash collision risk** from 32-bit mapping for point IDs.
2. **Single-model dependency risk** (Gemini outage/quotas affect ingestion and query embeddings).
3. **Chunking quality ceiling** for long-form documents where concept boundaries matter.

---

## 2) Retrieval and recovery behavior review

## 2.1 `kb_search` quality

`kb_search` has several mature behaviors:

- Mode-aware `top_k` clamping (voice stricter than text).
- Search fan-out (`searchLimit = max(topK*3, 15)`) before entity-level dedupe.
- Schema-to-store filter mapping (`type -> entity_type`, `related_to -> related_entities contains`).
- Asset-aware post-processing:
  - Stable asset refs
  - Dead-asset detection
  - Optional pixel payload for top visual result (text mode)
- Enriched recommendation cues:
  - `_assetHints` attached to top non-asset entities
  - `_allAssets` returned for `related_to` flows
  - `_instructions` seeds “related projects” suggestions

This is a strong retrieval orchestration design for a small-to-medium KB.

## 2.2 `kb_get` quality (and primary weakness)

`kb_get` currently retrieves by:

1. Generating a dummy embedding (`"document"`)
2. Calling vector search with `topK=100` and `entity_id` filter
3. Reconstructing content from returned chunks

This is a practical workaround but now the largest technical debt item:

- Adds unnecessary embedding generation latency and API dependency.
- Has implicit hard-cap behavior (`100`) that can truncate very large entities.
- Semantically mismatched with the tool’s “direct ID retrieval” contract.

## 2.3 Agent recovery behavior

Recovery scaffolding is substantial:

- Tool retry/backoff wrappers
- Loop detection + guardrails
- Relevance check (`areKbResultsRelevant`) that can stop low-quality KB chaining
- Tool-memory summary injection each session, plus explicit `query_tool_memory` recall path
- New-conversation stale memory clearing

These are excellent foundations for resilient behavior.

## 2.4 Recovery inconsistency to fix

There is one policy conflict with user-facing impact:

- Prompt policy: never expose raw tool errors to users.
- Chain path in API route currently adds an instruction requiring the model to quote tool error messages verbatim.

This contradiction can produce inconsistent tone and trust regression in failure cases.

---

## 3) How recommendations are currently generated

Recommendation behavior is generated from **three layers**:

1. **Prompt policy** (`prompts/core.md`)
   - Requires two follow-up suggestions in many text responses.
   - Encourages deepening before broadening and using KB-grounded narrative paths.
2. **Tool guides** (`tools/kb-search/guide.md`)
   - Explicit “find → fetch,” progressive disclosure, and related-project expansion patterns.
3. **Tool output hints** (`kb_search` `_instructions` + `_assetHints` + `_allAssets`)
   - Injects concrete cues about related visuals/projects and inventory completeness.

### Strengths

- Recommendations are generally evidence-aware (driven by retrieved entities and asset relationships).
- System encourages narrative continuity rather than catalog dumping.

### Weaknesses

- Decision policy is split across prompt text and tool-side generated prose, making it difficult to evaluate and tune globally.
- “Related projects” recommendation seed in `_instructions` is currently simplistic (based on top project results order rather than an explicit recommendation score).
- No explicit recommendation diversity controller (e.g., avoid repeating same entity family over many turns).

---

## 4) Priority recommendations (action plan)

## P0 (highest priority)

1. **Replace `kb_get` workaround with direct ID retrieval in vector-store service.**
   - Add `getByEntityId(entityId)` using Qdrant filter + scroll/retrieve APIs.
   - Remove dummy embedding dependency in `kb_get`.
   - Acceptance criteria: lower p95 latency, no topK chunk truncation risk, no embedding call needed.

2. **Resolve error-policy contradiction.**
   - Align chain tool-failure instruction with prompt policy (“summarize safely, don’t leak raw internals”).

## P1

3. **Centralize recommendation scoring.**
   - Promote recommendation generation from ad-hoc `_instructions` prose to structured fields (e.g., `recommendation_candidates[]` with rationale/score/type).

4. **Add retrieval + recommendation eval harness.**
   - Curated test queries: factual lookup, visual lookup, “show me something different,” sparse KB topics.
   - Track relevance, diversity, repetition, and recovery success rate.

5. **Migrate away from 32-bit hashed point IDs.**
   - Prefer UUID or deterministic string-safe ID strategy if supported in deployment constraints.

## P2

6. **Upgrade chunking to token/sentence-aware segmentation** for long docs.
7. **Introduce hybrid retrieval option** (semantic + lexical) for exact-name/entity-heavy queries.
8. **Add recommendation memory constraints** (don’t recommend same project repeatedly unless user asks).

---

## 5) Suggested target-state architecture

- **Embeddings:** same model baseline (short term), optional provider abstraction for failover.
- **Retrieval contract:**
  - `kb_search` = discovery/ranking
  - `kb_get` = deterministic direct fetch by ID (no embeddings)
- **Recommendation contract:** structured recommendation object returned by tools, consumed by response layer.
- **Recovery contract:** one policy source for user-facing failure messaging, with consistent phrasing templates.

---

## 6) Practical KPI targets

After P0/P1 work, monitor:

- `kb_get` median and p95 latency (expect clear drop)
- Rate of multi-step retrieval chains per successful answer (should reduce)
- % of failure responses leaking raw technical error details (target 0)
- Recommendation engagement rate (clicks/follow-up turns)
- Recommendation diversity index (unique entities over N turns)

---

## Bottom line

Fram already has a solid RAG+agent implementation with thoughtful asset handling and strong recovery primitives. The next stage is less about adding more features and more about **tightening contracts**:

- deterministic `kb_get`,
- unified failure messaging policy,
- and structured recommendation logic that can be evaluated and tuned.

Those changes should produce immediate gains in reliability, latency, and narrative quality.
