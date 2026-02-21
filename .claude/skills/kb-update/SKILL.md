---
name: kb-update
description: Use when adding new KB entries (people, labs, projects), updating existing entries, or adding new sections. Triggers on "update kb", "add project", "add person", "new kb entry", "update knowledge base", "kb update"
---

# KB Update

Add or update knowledge base entries through a structured interview, then run the full pipeline (write markdown, upload images, embed, verify).

## Three Phases

1. **Interview** — route to entity type, ask deep questions one at a time
2. **Generate + Preview** — produce markdown and manifest entries, show for approval
3. **Pipeline** — write files, upload images, embed into Qdrant, verify

**Hard rule:** Nothing is written to disk until the user approves the preview.

---

## Phase 1: Routing

Ask two questions to determine the workflow:

**Question 1 — Action:**
> Are you adding something new or updating an existing entry?

- **New** → ask entity type (person / lab / project), then start interview
- **Update** → ask what entry to update, use `kb-search` tool or `Grep` to find it, `Read` the file, show current section headings, then ask:
  > What do you want to do?
  - Edit existing sections (multi-select which ones)
  - Add new sections
  - Both

For updates: interview only on the changed/new sections. Show the full updated file in preview.

---

## Phase 2: Interview

Ask **one question at a time**. Use `AskUserQuestion` for choices. Use direct questions for narrative content. Always go deep — if an answer is thin, probe further.

### Project Interview (~12-15 questions)

**Frontmatter:**
1. Project name + aliases
2. Status: shipped / ongoing / archived / prototype / exploration / concept
3. Time period (e.g. 2022-2024)
4. Client or internal? If client, who?
5. Team members — match against existing `person:` IDs in `kb/people/`. Note any new people not yet in KB.
6. Domains — e.g. wearables, mobile, AI, branding. Offer existing domains from other projects as options + custom.

**Body (deep dive):**
7. "Give me the elevator pitch — what is this project in 1-2 sentences?"
8. "What was the context? What problem or opportunity existed before this project?"
9. "What was your specific role and scope? What parts were you responsible for?"
10. "Walk me through what was actually built — key design decisions, systems, artifacts."
11. "What were the outcomes? Launches, metrics, acquisitions, user response, industry recognition?"
12. "What does this project represent in the bigger picture of your work? Why does it matter to FRAM's story?"
13. "Any links? Website, case study, press, app store?"
14. "Do you have images for this project? If yes, I'll need the local file paths."

**If images exist**, for each image ask:
- What does this image show? (becomes `description`)
- Short caption for display (becomes `caption`)
- What type? photo / diagram / video / gif (becomes `entity_type`)
- Tags (suggest based on project domains)

**Follow-up probing examples:**
- Thin answer on "what was built" → "Can you tell me more about the interaction model / architecture / key design decision?"
- Thin answer on role → "Were you leading the design? Collaborating? What was the team dynamic?"
- Thin answer on outcomes → "Any numbers? User counts, revenue, press mentions, awards?"

### Person Interview (~8-10 questions)

**Frontmatter:**
1. Full name + aliases
2. Current roles (e.g. Founder, Designer)
3. Affiliation — match against existing `lab:` IDs
4. Location (country)
5. Education — degree + institution (can be multiple)
6. Experience timeline — for each entry: company, role, location, period, outcome
7. Contacts — email, LinkedIn, Twitter, website
8. Contact policy — preferred method, any notes

**Body:**
9. "Give me a bio summary — who is this person in 2-3 sentences?"
10. "Walk me through their background — key roles, what they did, what shaped them."
11. "What are their principles or viewpoints on design/technology/work?"
12. "What topics are they most interested in right now?"
13. "Any personal notes?" (first person allowed here, emotion/metaphor OK)

### Lab Interview (~8-10 questions)

**Frontmatter:**
1. Name + aliases
2. Legal name
3. Location (region)
4. Founders — match against existing `person:` IDs
5. Team — size (small/medium/large) + composition (e.g. senior)
6. Focus areas (e.g. product design, AI-native interactions)
7. Engagement modes (e.g. product_studio, consulting)
8. Contacts — email, website
9. Contact policy

**Body:**
10. "What does this lab do? The overview."
11. "How does it work? Process, approach, philosophy."
12. "What are the core focus areas in detail?"
13. "What principles guide the work?"
14. "How does the lab engage with clients?"
15. "What is this lab NOT? What does it explicitly avoid?"

---

## Phase 3: Generate + Preview

### Markdown generation rules

- **ID format**: `{type}:{snake_case_name}` (e.g. `project:my_project`)
- **Filename**: `kb/{type}/{snake_case_name}_{type}.md` — match ID suffix to filename
  - People go in `kb/people/`
  - Labs go in `kb/lab/`
  - Projects go in `kb/project/`
- **Frontmatter**: Follow schemas in `kb/README.md` exactly. No prose in frontmatter. No metrics.
- **Body**: Third person, no slang, no ALL CAPS, one idea per paragraph. Clear `## Section` headers.
- **Personal Notes** section (person entities only): First person allowed, emotion OK, still fix spelling.
- **Cross-references**: Use entity IDs in frontmatter (e.g. `team: [person:andrei_clodius]`)

### Manifest entries (if images exist)

For each image, generate a manifest entry:
```json
{
  "id": "asset:{slug}_{sequence}",
  "type": "asset",
  "entity_type": "photo|diagram|video|gif",
  "title": "Descriptive title",
  "description": "Detailed description for embedding and context",
  "path": "",
  "related_entities": ["project:entity_id"],
  "tags": ["tag1", "tag2"],
  "caption": "Short display caption",
  "metadata": {
    "date": "2024",
    "format": "jpeg",
    "source": "FRAM Design portfolio"
  },
  "blob_id": "folder/descriptive-slug",
  "file_extension": "jpeg",
  "storage_provider": "gcs"
}
```

**blob_id rules:**
- Format: `{folder}/{descriptive-slug}` — e.g. `new-project/hero-shot`
- Use the entity name (kebab-case) as folder
- Use descriptive slugs for filenames
- **Never change a blob_id after creation** — signed URLs depend on it

### Preview flow

1. Show full markdown in a fenced code block
2. Ask: "Does this look right? Anything to change?"
3. If changes → revise and show again
4. Once markdown approved, show manifest entries (if any)
5. Ask: "Manifest entries look good?"
6. Proceed to pipeline only after all approvals

---

## Phase 4: Pipeline

Run these steps in order. Report status after each.

### 1. Write markdown file
Write to `kb/{type}/{name}_{type}.md` using the Write tool.

### 2. Update manifest (if images)
Read `kb/assets/manifest.json`, append new asset entries to the `assets` array, write back. Preserve all existing entries.

### 3. Upload images to GCS (if images)
For each new image, run:
```bash
npx tsx scripts/upload-asset.ts <local-file-path> <blob-id> [--extension jpeg]
```
The script auto-detects extension from the file path. Use `--extension` only to override.

### 4. Embed into Qdrant
```bash
npx tsx scripts/Embed/embed-kb.ts
```

### 5. Verify embedding
```bash
npx tsx scripts/Embed/verify-kb-embedding.ts
```

### 6. Quick search test
```bash
npx tsx scripts/Testing/kb/test-search.ts "entity title here"
```

### Error handling
- Image upload fails → report which failed, continue with rest, note what needs manual fix
- Embedding fails → content is on disk, tell user to retry `npx tsx scripts/Embed/embed-kb.ts`
- Verification fails → flag it, don't roll back

### Completion summary
Report:
- Files written (paths)
- Images uploaded (count, any failures)
- Embedding status
- Verification status (entity found in vector store)

**Do NOT auto-commit.** Let the user decide when to commit.
