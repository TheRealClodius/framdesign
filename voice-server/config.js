/**
 * FRAM System Prompt Configuration
 * Loads prompts from markdown files in prompts/ directory
 */

import { loadVoicePrompt } from './prompt-loader.js';

// Load voice mode system prompt from markdown files
export const FRAM_SYSTEM_PROMPT = loadVoicePrompt();