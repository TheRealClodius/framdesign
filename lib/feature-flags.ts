/**
 * Build-time feature flags. NEXT_PUBLIC_* values are inlined into the client
 * bundle at build time, so changing one requires a rebuild/redeploy.
 */

/** Voice mode (mic button + agent-initiated voice sessions). Off unless explicitly enabled. */
export const VOICE_ENABLED = process.env.NEXT_PUBLIC_VOICE_ENABLED === "true";

/** Tool IDs that only make sense when voice mode is available. */
export const VOICE_TOOL_IDS: ReadonlySet<string> = new Set([
  "start_voice_session",
  "end_voice_session",
]);
