/**
 * Prompt Loader - Composes system prompts from markdown files.
 *
 * IMPORTANT (Vercel/serverless):
 * - Do NOT read prompt files via fs at runtime (file may not be present in the lambda bundle).
 * - Instead, import markdown as source at build time so it is bundled reliably.
 *
 * next.config.ts configures `.md` as `asset/source`, so these imports become strings.
 */

import coreMd from '../prompts/core.md';
import voiceBehaviorMd from '../prompts/voice-behavior.md';
import ignoreUserToolMd from '../prompts/tools/ignore_user.md';
import endVoiceSessionToolMd from '../prompts/tools/end_voice_session.md';

/**
 * Helper to strip the top-level markdown header from a file.
 */
function normalizePrompt(content: string): string {
  return content.replace(/^# .*$/m, '').trim();
}

/**
 * Loads the text mode system prompt
 * Composition: core + tools/ignore_user
 */
export function loadTextPrompt(): string {
  try {
    const core = normalizePrompt(coreMd);
    const ignoreUserTool = normalizePrompt(ignoreUserToolMd);

    return `${core}\n\n${ignoreUserTool}`;
  } catch (error) {
    console.error('Error loading text prompt:', error);
    throw new Error('Failed to load text mode prompt files (build-time import)');
  }
}

/**
 * Loads the voice mode system prompt
 * Composition: core + voice-behavior + tools/ignore_user + tools/end_voice_session
 */
export function loadVoicePrompt(): string {
  try {
    const core = normalizePrompt(coreMd);
    const voiceBehavior = normalizePrompt(voiceBehaviorMd);
    const ignoreUserTool = normalizePrompt(ignoreUserToolMd);
    const endVoiceSessionTool = normalizePrompt(endVoiceSessionToolMd);

    return `${core}\n\n${voiceBehavior}\n\n${ignoreUserTool}\n\n${endVoiceSessionTool}`;
  } catch (error) {
    console.error('Error loading voice prompt:', error);
    throw new Error('Failed to load voice mode prompt files (build-time import)');
  }
}
