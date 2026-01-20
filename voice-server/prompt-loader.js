/**
 * Prompt Loader - Loads the voice system prompt
 * Single file approach - core.md contains everything
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
 * @returns {string}
 */
export function loadTextPrompt() {
  try {
    return readPromptFile('core.md');
  } catch (error) {
    console.error('Error loading text prompt:', error);
    throw new Error(`Failed to load text mode prompt files from ${PROMPTS_DIR}`);
  }
}

/**
 * Loads the voice mode system prompt
 * Same as text - core.md now contains all voice-specific instructions
 * @returns {string}
 */
export function loadVoicePrompt() {
  try {
    return readPromptFile('core.md');
  } catch (error) {
    console.error('Error loading voice prompt:', error);
    throw new Error(`Failed to load voice mode prompt files from ${PROMPTS_DIR}`);
  }
}
