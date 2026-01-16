# Knowledge Base

## Entity types

- `person` — individuals
- `lab` — organizations like FRAM
- `project` — shipped or ongoing work

---

## Schema registry

### person

| Field | Required | Type | Notes |
|-------|----------|------|-------|
| `id` | ✓ | `string` | Format: `person:{filename}` |
| `type` | ✓ | `enum("person")` | |
| `title` | ✓ | `string` | Full name |
| `aliases` | | `array<string>` | Alternative names for matching |
| `roles` | | `array<string>` | Current roles (e.g., Founder) |
| `affiliation` | | `string` | Reference ID (e.g., `lab:fram_design`) |
| `location` | | `object` | `country` |
| `education` | | `array<object>` | `degree`, `institution` |
| `experience` | | `array<object>` | `company`, `role`, `location`, `period`, `outcome` |
| `contacts` | | `object` | `email`, `linkedin`, `twitter`, etc. |
| `contact_policy` | | `object` | `preferred`, `notes` |

### lab

| Field | Required | Type | Notes |
|-------|----------|------|-------|
| `id` | ✓ | `string` | Format: `lab:{filename}` |
| `type` | ✓ | `enum("lab")` | |
| `title` | ✓ | `string` | Display name |
| `aliases` | | `array<string>` | Alternative names for matching |
| `legal_name` | | `string` | Official registered name |
| `based_in` | | `object` | `region` |
| `founders` | | `array<string>` | Reference IDs (e.g., `person:andrei_clodius`) |
| `team` | | `object` | `size`, `composition` |
| `focus` | | `array<string>` | Core competencies |
| `engagement_modes` | | `array<string>` | How the lab works with clients |
| `contacts` | | `object` | `email`, `website`, etc. |
| `contact_policy` | | `object` | `preferred`, `notes` |

### project

| Field | Required | Type | Notes |
|-------|----------|------|-------|
| `id` | ✓ | `string` | Format: `project:{filename}` |
| `type` | ✓ | `enum("project")` | |
| `title` | ✓ | `string` | Project name |
| `status` | ✓ | `enum("shipped", "ongoing", "archived")` | |
| `aliases` | | `array<string>` | Alternative names for matching |
| `period` | | `string` | Timeframe (e.g., `2024-2025`) |
| `client` | | `string` | Reference ID or external org name |
| `team` | | `array<string>` | Reference IDs (e.g., `person:andrei_clodius`) |
| `domains` | | `array<string>` | Areas of work (e.g., `mobile`, `AI`) |
| `outcomes` | | `array<string>` | Key results or deliverables |
| `links` | | `object` | `app_store`, `play_store`, `case_study`, `press` |

---

## Rules

### Naming
- Filename must match ID suffix: `people/andrei_clodius.md` → `id: person:andrei_clodius`
- Use `snake_case` for filenames and ID suffixes

### Frontmatter
- Predictable, schematizable, boring
- No prose — use Markdown body for narrative
- No metrics or achievements — those go in body
- Exception: small, stable categorical values (e.g., `team.size: small`) are allowed
- Consistent field names across all entities

### Body sections (authoritative)
- Third person only
- No slang, no ALL CAPS
- No typos, no tense shifts
- Each paragraph = one idea

### Personal Notes (non-authoritative)
- First person allowed
- Emotion and metaphor allowed
- Still fix spelling and broken sentences

---

## Embedding

KB documents are embedded into Qdrant Cloud vector database for semantic search. The embedding process:

1. **Reads all markdown files** from `kb/` directory (excluding `README.md`)
2. **Splits documents into chunks** (1000 chars with 200 char overlap)
3. **Generates embeddings** using Gemini's `text-embedding-004` model (768 dimensions)
4. **Stores in Qdrant Cloud** with unique chunk IDs and metadata

### Running Embedding

```bash
npx tsx scripts/Embed/embed-kb.ts
```

**Requirements:**
- `GEMINI_API_KEY` must be set in `.env.local`
- `QDRANT_CLUSTER_ENDPOINT` must be set in `.env.local`
- `QDRANT_API_KEY` must be set in `.env.local`

### Document ID Format

Each chunk gets a unique ID:
- **Single chunk**: `{entity_id}_chunk_0` (e.g., `project:fitbit_OS_chunk_0`)
- **Multiple chunks**: `{entity_id}_chunk_0`, `{entity_id}_chunk_1`, etc.

Where `entity_id` comes from frontmatter `id` field (e.g., `person:andrei_clodius`).

**Important:** The frontmatter `id` field is stored as `entity_id` in metadata to avoid conflicts with document IDs.

### Metadata Stored

Each chunk includes:
- `file_path`: Relative path from `kb/` directory
- `chunk_index`: 0-based chunk index
- `total_chunks`: Total chunks for this document
- `entity_type`: From frontmatter `type` field
- `entity_id`: From frontmatter `id` field
- `title`: From frontmatter `title` field
- All other frontmatter fields (except `id`, which is stored as `entity_id`)

### Verification

Check embedding status:
```bash
npx tsx scripts/Embed/verify-kb-embedding.ts
```

This verifies:
- All KB files are embedded
- Chunks have unique IDs
- No orphaned chunks exist
