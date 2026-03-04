# TASKS

## ⚠ BEFORE ANYTHING ELSE

### Re-embed KB after Connecticut hallucination fix

**Branch:** `claude/fix-fram-hallucination-0qsnX`

`kb/lab/fram_design.md` was updated with explicit Romania location and a disambiguation note about FRAM Filters. These changes must be pushed into Qdrant before the fix takes effect in the agent.

```bash
npx tsx scripts/Embed/embed-kb.ts
```

Then restart the dev server so the updated `prompts/core.md` is reloaded.

---

## Pending

### 1. Inject user local time + timezone into agent context

The agent currently receives UTC time. Detect the user's actual timezone and local time on the client, then inject it into the agent context so time-aware responses use the correct local time. No other current-time specifics needed beyond time + timezone.

### 2. Floating prompt input and header redesign

Redesign the prompt input and header to both be floating (not fixed to page flow). Details TBD.

### 3. Conversation compaction after 20+ Q&A pairs

After more than 20 question-answer pairs in a conversation, compact the history to manage context length. Summarize or prune older exchanges while preserving key context.

---

## Completed

## Improve Agent Observability

**Branch:** `claude/improve-agent-observability-x45E5`
**Date:** 2026-02-20

### Problem

Four recurring production issues with no visibility into root causes:

1. **Dead images** — Agent shares KB images that appear broken because the file doesn't exist in GCS
2. **Hallucinated people info** — No frontmatter validation means bad/incomplete data gets embedded and served
3. **Failed tool calls** — Errors tracked as rates but no structured context (what failed, why, with what args)
4. **Badly indexed assets** — No validation of manifest.json against schema, GCS, or KB cross-references

### What was built

| Change | File(s) | Purpose |
|---|---|---|
| KB health audit script | `scripts/kb-audit.ts` | Validates frontmatter schema, asset manifest integrity, cross-references, Qdrant embedding coverage, and GCS asset existence. Run via `npm run kb:audit` or `npm run kb:audit:fast` (skips GCS/Qdrant). Supports `--json` output. |
| Structured tool event logger | `tools/_core/tool-events.js` | Ring buffer (200 events) capturing `tool_error`, `dead_asset`, `validation_failure`, `budget_violation` with full context. Queryable by type/tool/time. |
| Safe blob URL resolver | `lib/services/blob-storage-service.ts` | `resolveBlobUrlSafe()` checks GCS existence before generating signed URLs. Returns `{ url, exists }`. 10-min existence cache prevents repeated HEAD requests. |
| Dead asset detection in kb_search | `tools/kb-search/handler.js` | Uses safe resolver at query time. Dead assets get `_dead: true` flag, excluded from markdown, agent warned via `_instructions`. `_diagnostics.dead_assets` array in response. |
| Dead asset detection in kb_get | `tools/kb-get/handler.js` | Same detection. Suppresses markdown/URL for missing assets. `_diagnostics.dead_asset` flag. Agent gets explicit "DO NOT share" instruction. |
| Registry error events | `tools/_core/registry.js` | `emitToolEvent` called on validation failures, handler errors (ToolError + unexpected), and budget violations. |
| Metrics endpoint events | `tools/_core/metrics-endpoint.js` | Event summary always included in `/metrics` response. Full recent events via `?events=true`. |
| npm scripts + CLAUDE.md | `package.json`, `CLAUDE.md` | Added `kb:audit` and `kb:audit:fast` commands to scripts and command reference table. |

### How to use

```bash
# Full audit (frontmatter + manifest + cross-refs + Qdrant + GCS)
npm run kb:audit

# Fast audit (no network calls)
npm run kb:audit:fast

# JSON output for CI
npx tsx scripts/kb-audit.ts --json

# Check runtime events via metrics endpoint
curl http://localhost:8080/metrics?events=true | jq '.events'
```
