# FRAM Prompts

This directory contains the system prompts for FRAM's **text mode**.

Voice mode prompts are in `voice-server/prompts/`.

## Structure

```
prompts/
├── core.md                    # Core personality, identity, curatorial behavior
└── tools/
    ├── ignore_user.md         # Timeout tool
    └── end_voice_session.md   # End session tool (voice reference)
```

## How It Works

Text mode prompt is composed at runtime:

**Text Mode**: `core.md` + `tools/ignore_user.md`

## Usage

### Editing Prompts

Edit the markdown files directly. Changes take effect when the Next.js app rebuilds.

### Code Integration

```typescript
import { FRAM_SYSTEM_PROMPT } from '@/lib/config';
```

Loaded via `lib/prompt-loader.ts` → `loadTextPrompt()`

## Voice Mode

Voice prompts live in `voice-server/prompts/core.md` — a standalone file deployed to Railway.

See `voice-server/` for voice mode configuration.
