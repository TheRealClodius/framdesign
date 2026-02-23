/**
 * FRAM System Prompt Configuration
 * Loads prompts from markdown files in prompts/ directory
 * Tool documentation is loaded from registry at runtime
 */

import { loadVoicePrompt } from './prompt-loader.js';

// Base voice mode system prompt (core + voice-behavior)
const FRAM_BASE_PROMPT = loadVoicePrompt();

/**
 * Build full system instruction with tool documentation
 * Tool docs are pulled from registry and appended to base prompt
 * Filters tools by mode and prefers voice-specific guides when available
 *
 * @param {ToolRegistry} toolRegistry - Tool registry instance
 * @param {string} mode - Mode filter ('text' or 'voice')
 * @returns {string} - Complete system instruction
 */
export function buildSystemInstruction(toolRegistry, mode = 'voice') {
  const toolDocs = Array.from(toolRegistry.tools.values())
    .filter(tool => tool.allowedModes.includes(mode))
    .map(tool => {
      const doc = (mode === 'voice' && tool.voiceDocumentation) ? tool.voiceDocumentation : tool.documentation;
      return `## ${tool.toolId}\n${doc}`;
    })
    .join('\n\n');

  return `${FRAM_BASE_PROMPT}\n\n# Available Tools\n\n${toolDocs}`;
}

// For backwards compatibility, export base prompt as FRAM_SYSTEM_PROMPT
// But voice server should use buildSystemInstruction() instead
export const FRAM_SYSTEM_PROMPT = FRAM_BASE_PROMPT;