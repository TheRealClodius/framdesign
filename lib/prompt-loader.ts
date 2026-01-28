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
 * Gets today's date in YYYY-MM-DD format
 */
function getCurrentDate(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Loads the text mode system prompt
 * Composition: core + tools/ignore_user + current date context
 */
export function loadTextPrompt(): string {
  try {
    const core = readPromptFile('core.md');
    const ignoreUserTool = readPromptFile('tools/ignore_user.md');

    // Add current date context for real-time awareness
    const dateContext = `\n\n## Current Date\n\nToday's date is ${getCurrentDate()}. When users ask about "latest", "recent", "as of [year]", or current information, use this date as your reference point. Use the perplexity_search tool to get real-time information when needed.`;

    return `${core}${dateContext}\n\n${ignoreUserTool}`;
  } catch (error) {
    console.error('Error loading text prompt:', error);
    throw new Error(`Failed to load text mode prompt files from ${PROMPTS_DIR}`);
  }
}

