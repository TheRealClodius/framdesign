/**
 * Configuration constants for the application
 * Loads prompts from markdown files in prompts/ directory
 * 
 * NOTE: This module uses Node.js fs/path and should only be imported server-side.
 * Next.js will automatically exclude this from client bundles.
 */

import { loadTextPrompt } from './prompt-loader';

// Load text mode system prompt from markdown files
// This only executes server-side (Next.js API routes)
export const FRAM_SYSTEM_PROMPT = loadTextPrompt();
