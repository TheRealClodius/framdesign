/**
 * Configuration constants for the application
 * Loads prompts from markdown files in prompts/ directory
 */

import { loadTextPrompt } from './prompt-loader';

// Load text mode system prompt from markdown files
export const FRAM_SYSTEM_PROMPT = loadTextPrompt();
