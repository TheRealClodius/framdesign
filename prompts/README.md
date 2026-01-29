# FRAM Prompts

This directory contains the system prompts for FRAM's **text mode**.

Voice mode prompts are in `voice-server/prompts/`.

## Structure

```
prompts/
├── core.md        # Core personality, identity, curatorial behavior
└── README.md      # This file
```

## How It Works

Text mode prompt is composed at runtime by `lib/prompt-loader.ts`:

1. `core.md` content is loaded
2. Tool guides are automatically injected from `tools/*/guide.md` files

**Note**: Tool documentation is now sourced from the tool registry. Each tool's `guide.md` is compiled into `tools/tool_registry.json` at build time and injected into the system prompt. This ensures the agent has access to detailed tool usage guidance while keeping tool documentation co-located with the tool code.

### Date/Time Context

Date context is no longer included in the system prompt. Instead, timestamps are added to user messages in the message history. This allows:
- The agent to infer the current time from the most recent message
- The system prompt to remain stable for better Gemini cache utilization

## Usage

### Editing Prompts

Edit `core.md` directly. Changes take effect when the Next.js app rebuilds.

For tool-specific guidance, edit the `guide.md` file in each tool's directory (`tools/<tool-name>/guide.md`).

### Code Integration

```typescript
import { FRAM_SYSTEM_PROMPT } from '@/lib/config';
```

Loaded via `lib/prompt-loader.ts` → `loadTextPrompt()`

## Voice Mode

Voice prompts live in `voice-server/prompts/core.md` — a standalone file deployed to Railway.

See `voice-server/` for voice mode configuration.
