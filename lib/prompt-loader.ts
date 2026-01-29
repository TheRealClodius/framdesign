/**
 * Prompt Loader - Composes system prompts from markdown files
 * Reads from prompts/ directory and combines core + tool guides from registry
 *
 * Note: Date/time context is no longer injected into the system prompt.
 * Instead, timestamps are added to user messages in the message history,
 * allowing the agent to infer the current time from the most recent message.
 * This keeps the system prompt stable for better Gemini cache utilization.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const PROMPTS_DIR = join(process.cwd(), 'prompts');
const TOOLS_DIR = join(process.cwd(), 'tools');

/**
 * Helper to read and strip top-level markdown header from a file
 */
function readPromptFile(filename: string): string {
  const content = readFileSync(join(PROMPTS_DIR, filename), 'utf-8');
  // Strip top-level markdown header (# Title)
  return content.replace(/^# .*$/m, '').trim();
}

/**
 * Load tool guides from the tool registry
 * Each tool's guide.md content is stored in the registry as 'documentation'
 * @returns Formatted tool guides section for the system prompt
 */
function loadToolGuides(): string {
  const registryPath = join(TOOLS_DIR, 'tool_registry.json');

  try {
    const registry = JSON.parse(readFileSync(registryPath, 'utf-8'));

    const guides = registry.tools
      .filter((tool: { documentation?: string }) => tool.documentation)
      .map(
        (tool: { toolId: string; documentation: string }) =>
          `### ${tool.toolId}\n\n${tool.documentation}`
      )
      .join('\n\n---\n\n');

    if (!guides) return '';
    return `## Tool Usage Guides\n\n${guides}`;
  } catch (error) {
    console.error('Error loading tool guides from registry:', error);
    // Return empty string on error - don't fail the entire prompt load
    return '';
  }
}

/**
 * Loads the text mode system prompt
 * Composition: core.md + tool guides from registry
 *
 * Note: No date context is included - timestamps are added to messages instead.
 */
export function loadTextPrompt(): string {
  try {
    const core = readPromptFile('core.md');
    const toolGuides = loadToolGuides();

    return `${core}\n\n${toolGuides}`;
  } catch (error) {
    console.error('Error loading text prompt:', error);
    throw new Error(`Failed to load text mode prompt files from ${PROMPTS_DIR}`);
  }
}
