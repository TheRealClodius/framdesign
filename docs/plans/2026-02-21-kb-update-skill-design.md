# KB Update Skill Design

**Date:** 2026-02-21
**Status:** Approved

## Summary

A Claude Code skill (`/kb-update`) that manages knowledge base content through a three-phase workflow: structured interview, content generation with preview, and automated pipeline execution.

## Requirements

- Handles all entity types: person, lab, project
- Supports both creating new entries and updating existing ones (including adding new sections)
- Deep interview structure — information lives in the user's head, not in documents
- Full end-to-end pipeline: write markdown, upload images to GCS, embed into Qdrant, verify
- Always go deep on content quality — no shortcuts

## Approach: Phased Skill (Approach B)

One skill with three phases:

### Phase 1: Interview
- Routes based on action (new vs update) and entity type
- For updates: finds existing entry, shows structure, asks what to change/add
- Per-entity-type question sequences covering all frontmatter fields and body sections
- One question at a time, follow-up probing on thin answers
- Collects image paths with descriptions, captions, and types

### Phase 2: Generate + Preview
- Produces markdown following `kb/README.md` schemas exactly
- Generates manifest entries for any images
- Shows full preview for user approval before writing anything

### Phase 3: Pipeline
- Writes markdown file
- Updates `kb/assets/manifest.json` with new asset entries
- Uploads images via `scripts/upload-asset.ts`
- Runs `npx tsx scripts/Embed/embed-kb.ts`
- Runs verification and search test
- Reports completion summary
- Does NOT auto-commit

## Files Created

- `.claude/skills/kb-update/SKILL.md` — the skill definition
- `scripts/upload-asset.ts` — single-asset GCS upload script

## Interview Structure

### Project (~12-15 questions)
Frontmatter: name, aliases, status, period, client, team, domains
Body: elevator pitch, context/problem, role/scope, what was built, outcomes, significance, links, images

### Person (~8-10 questions)
Frontmatter: name, aliases, roles, affiliation, location, education, experience, contacts
Body: bio, background, principles, interests, personal notes

### Lab (~8-10 questions)
Frontmatter: name, aliases, legal name, location, founders, team, focus, engagement modes, contacts
Body: overview, how it works, focus areas, principles, engagement modes, what it's NOT
