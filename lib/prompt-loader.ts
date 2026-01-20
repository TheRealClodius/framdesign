/**
 * Prompt Loader - Composes system prompts from markdown files
 * Reads from prompts/ directory and combines core + mode-specific + tools
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const PROMPTS_DIR = join(process.cwd(), 'prompts');

/**
 * Helper to read and strip top-level markdown header from a file
 */
function readPromptFile(filename: string): string {
  const content = readFileSync(join(PROMPTS_DIR, filename), 'utf-8');
  // Strip top-level markdown header (# Title)
  return content.replace(/^# .*$/m, '').trim();
}

/**
 * Loads the text mode system prompt
 * Composition: core + tools/ignore_user
 */
export function loadTextPrompt(): string {
  try {
    const core = readPromptFile('core.md');
    const ignoreUserTool = readPromptFile('tools/ignore_user.md');

    return `${core}\n\n${ignoreUserTool}`;
  } catch (error) {
    console.error('Error loading text prompt:', error);
    throw new Error(`Failed to load text mode prompt files from ${PROMPTS_DIR}`);
  }
}

