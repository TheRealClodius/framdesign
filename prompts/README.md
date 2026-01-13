# FRAM Prompts

This directory contains the system prompts that govern FRAM's behavior across different modes.

## Structure

```
prompts/
├── core.md              # Core personality, identity, communication rules (shared)
├── voice-behavior.md    # Voice-specific behavioral instructions
└── tools/
    ├── ignore_user.md        # Timeout tool (both modes)
    └── end_voice_session.md  # End session tool (voice only)
```

- **`core.md`** - Core personality, identity, and communication rules (shared by all modes)
- **`voice-behavior.md`** - Voice-specific behavioral instructions (silence handling, cadence, interruptions)
- **`tools/ignore_user.md`** - Timeout tool documentation (available in both modes)
- **`tools/end_voice_session.md`** - End voice session tool documentation (voice only)

## How It Works

The prompt files are composed together at runtime:

1. **Text Mode**: `core.md` + `tools/ignore_user.md`
2. **Voice Mode**: `core.md` + `voice-behavior.md` + `tools/ignore_user.md` + `tools/end_voice_session.md`

## Usage

### Editing Prompts

Simply edit the markdown files in this directory. The changes will be picked up when:
- The voice server restarts
- The Next.js app rebuilds (in development, this happens automatically)

### Code Integration

The prompts are loaded via:
- `lib/prompt-loader.ts` - TypeScript loader for the main app
- `voice-server/prompt-loader.js` - JavaScript loader for the voice server

Both loaders export these functions:
- `loadTextPrompt()` - Loads core + text-mode
- `loadVoicePrompt()` - Loads core + voice-mode
- `loadPrompt(mode)` - Generic loader with mode parameter

### In Code

```typescript
// Main app (TypeScript)
import { FRAM_SYSTEM_PROMPT } from '@/lib/config';

// Voice server (JavaScript)
import { FRAM_SYSTEM_PROMPT } from './config.js';
```

## Benefits

✅ **Single source of truth** - No duplication between files  
✅ **Easy to edit** - Plain markdown files, no code  
✅ **Mode-specific** - Clean separation of voice vs text behaviors  
✅ **Version control friendly** - Easy to track changes and revert  
✅ **No build step** - Changes take effect on restart/rebuild

## Guidelines

- Keep `core.md` mode-agnostic (applicable to both voice and text)
- Put mode-specific instructions in their respective files
- Use clear, direct language (FRAM's style)
- Test changes in both modes after editing
