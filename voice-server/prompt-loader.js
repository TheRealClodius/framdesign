/**
 * Prompt Loader - Composes system prompts from markdown files
 * Reads from prompts/ directory and combines core + mode-specific + tools
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Get the directory path of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Prompts directory is inside voice-server for Railway deployment
const PROMPTS_DIR = join(__dirname, 'prompts');

/**
 * Helper to read and strip top-level markdown header from a file
 * @param {string} filename - Relative path from PROMPTS_DIR
 * @returns {string}
 */
function readPromptFile(filename) {
  const content = readFileSync(join(PROMPTS_DIR, filename), 'utf-8');
  // Strip top-level markdown header (# Title)
  return content.replace(/^# .*$/m, '').trim();
}

/**
 * Loads the text mode system prompt
 * Composition: core only
 * NOTE: Tool documentation is now loaded from registry, not prompts/
 * @returns {string}
 */
export function loadTextPrompt() {
  try {
    const core = readPromptFile('core.md');

    return core;
  } catch (error) {
    console.error('Error loading text prompt:', error);
    throw new Error(`Failed to load text mode prompt files from ${PROMPTS_DIR}`);
  }
}

/**
 * Loads the voice mode system prompt
 * Composition: core + voice-behavior
 * NOTE: Tool documentation is now loaded from registry, not prompts/
 * @returns {string}
 */
export function loadVoicePrompt() {
  try {
    const core = readPromptFile('core.md');
    const voiceBehavior = readPromptFile('voice-behavior.md');

    return `${core}\n\n${voiceBehavior}`;
  } catch (error) {
    console.error('Error loading voice prompt:', error);
    throw new Error(`Failed to load voice mode prompt files from ${PROMPTS_DIR}`);
  }
}
