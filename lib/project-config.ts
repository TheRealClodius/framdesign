/**
 * Project Configuration
 *
 * Central configuration for project-to-entity mappings.
 * This is the single source of truth for linking project names to their knowledge base entities.
 *
 * HOW TO ADD A NEW PROJECT:
 *
 * 1. Add project name to PROJECTS array in components/ChatInterface.tsx (line ~474-481)
 * 2. Add assets to kb/assets/manifest.json with related_entities matching the entity ID below
 * 3. Add mapping below (project name → entity ID)
 * 4. Done! Images will automatically appear on hover
 *
 * EXAMPLE:
 * If adding "New AI Tool" project:
 * - Add "New AI Tool" to PROJECTS array
 * - In manifest.json: "related_entities": ["project:new_ai_tool"]
 * - Below: "New AI Tool": "project:new_ai_tool"
 */

/**
 * Maps display names (from PROJECTS array) to knowledge base entity IDs
 */
export const PROJECT_ENTITY_MAP: Record<string, string> = {
  "Vector Watch": "project:vector_watch",
  "UiPath Autopilot": "project:autopilot_uipath",
  "Clipboard AI": "project:clipboard_ai_uipath",
  "Desktop Agent": "project:desktop_agent_uipath",
  "Semantic Space": "project:semantic_space",
  "Fitbit OS": "project:fitbit_os",  // No assets yet, but ready for future
};

/**
 * Asset type priority when multiple images exist for a project.
 * First matching type wins.
 *
 * For example, if a project has both a "photo" and a "diagram":
 * - "photo" will be selected (higher priority)
 */
export const ASSET_TYPE_PRIORITY = ["photo", "diagram", "video", "gif"] as const;

/**
 * Get all project names (for validation/debugging)
 */
export function getProjectNames(): string[] {
  return Object.keys(PROJECT_ENTITY_MAP);
}

/**
 * Check if a project name exists in the configuration
 */
export function isKnownProject(projectName: string): boolean {
  return projectName in PROJECT_ENTITY_MAP;
}
