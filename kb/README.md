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
