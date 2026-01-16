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
 *
 * @param {ToolRegistry} toolRegistry - Tool registry instance
 * @returns {string} - Complete system instruction
 */
export function buildSystemInstruction(toolRegistry) {
  const toolDocs = Array.from(toolRegistry.tools.values())
    .map(tool => `## ${tool.toolId}\n${tool.documentation}`)
    .join('\n\n');

  return `${FRAM_BASE_PROMPT}\n\n# Available Tools\n\n${toolDocs}`;
}

// For backwards compatibility, export base prompt as FRAM_SYSTEM_PROMPT
// But voice server should use buildSystemInstruction() instead
export const FRAM_SYSTEM_PROMPT = FRAM_BASE_PROMPT;