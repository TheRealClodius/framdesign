/**
 * Project Image Mapping Utility
 *
 * Maps project names (from suggestions) to their representative images.
 * Uses the manifest.json to discover assets and applies priority rules.
 */

import { PROJECT_ENTITY_MAP, ASSET_TYPE_PRIORITY } from './project-config';

/**
 * Asset structure from manifest.json
 */
interface Asset {
  id: string;
  type: string;
  entity_type: "photo" | "video" | "gif" | "diagram";
  title: string;
  description: string;
  path: string;
  related_entities: string[];
  tags: string[];
  caption: string;
  blob_id?: string;
  file_extension?: string;
  metadata?: Record<string, unknown>;
}

interface Manifest {
  version: string;
  assets: Asset[];
}

/**
 * Cached manifest (loaded once at module level)
 */
let manifestCache: Manifest | null = null;

/**
 * Load manifest from JSON file
 * Caches result for subsequent calls
 */
async function loadManifest(): Promise<Manifest> {
  if (manifestCache) {
    return manifestCache;
  }

  try {
    const response = await fetch('/kb/assets/manifest.json');
    if (!response.ok) {
      throw new Error(`Failed to load manifest: ${response.statusText}`);
    }
    manifestCache = await response.json();
    return manifestCache;
  } catch (error) {
    console.error('Error loading manifest:', error);
    // Return empty manifest on error
    return { version: '0.0.0', assets: [] };
  }
}

/**
 * Extract project name from suggestion text
 *
 * Handles patterns like:
 * - "Tell me about Vector Watch"
 * - "what does fitbit os do?"
 * - "Tell me more about UiPath Autopilot"
 *
 * @param suggestionText - The suggestion button text
 * @returns Project name if found, null otherwise
 */
export function extractProjectName(suggestionText: string): string | null {
  if (!suggestionText || typeof suggestionText !== 'string') {
    return null;
  }

  // Common patterns in suggestion text
  const patterns = [
    /tell me (?:about|more about)\s+(.+)/i,
    /what (?:does|is)\s+(.+?)\s+(?:do|does)\??/i,
    /show me\s+(.+)/i,
  ];

  // Try each pattern
  for (const pattern of patterns) {
    const match = suggestionText.match(pattern);
    if (match && match[1]) {
      const extracted = match[1].trim();

      // Check if extracted text matches any known project (case-insensitive)
      for (const projectName of Object.keys(PROJECT_ENTITY_MAP)) {
        if (projectName.toLowerCase() === extracted.toLowerCase()) {
          return projectName; // Return exact match from map
        }
      }
    }
  }

  return null;
}

/**
 * Find all assets related to a project entity ID
 *
 * @param projectEntityId - Entity ID like "project:vector_watch"
 * @returns Array of matching assets
 */
function findProjectAssets(manifest: Manifest, projectEntityId: string): Asset[] {
  return manifest.assets.filter(asset =>
    asset.related_entities && asset.related_entities.includes(projectEntityId)
  );
}

/**
 * Select best asset from array based on priority rules
 *
 * Priority order: photo > diagram > video > gif
 *
 * @param assets - Array of assets to choose from
 * @returns Best asset or null if none found
 */
function selectBestAsset(assets: Asset[]): Asset | null {
  if (assets.length === 0) {
    return null;
  }

  // Try each priority type in order
  for (const priorityType of ASSET_TYPE_PRIORITY) {
    const match = assets.find(asset => asset.entity_type === priorityType);
    if (match) {
      return match;
    }
  }

  // Fallback to first asset if no priority match
  return assets[0];
}

/**
 * Get image path for a project name
 *
 * @param projectName - Display name like "Vector Watch"
 * @returns Image path or null if not found
 */
export async function getProjectImagePath(projectName: string): Promise<string | null> {
  // Look up entity ID
  const entityId = PROJECT_ENTITY_MAP[projectName];
  if (!entityId) {
    return null;
  }

  // Load manifest
  const manifest = await loadManifest();

  // Find assets for this project
  const assets = findProjectAssets(manifest, entityId);
  if (assets.length === 0) {
    return null;
  }

  // Select best asset
  const asset = selectBestAsset(assets);
  if (!asset || !asset.blob_id || !asset.file_extension) {
    return null;
  }

  const signedUrl = await fetchSignedAssetUrl(asset.blob_id, asset.file_extension);
  return signedUrl;
}

async function fetchSignedAssetUrl(blobId: string, extension: string): Promise<string | null> {
  try {
    const response = await fetch('/api/refresh-asset-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blob_id: blobId, extension }),
    });
    if (!response.ok) {
      return null;
    }
    const data = await response.json();
    return data.url || null;
  } catch {
    return null;
  }
}

/**
 * Get suggestion image info (path, alt text, title)
 *
 * This is the main function to call from components.
 *
 * @param suggestionText - Suggestion button text like "Tell me about Vector Watch"
 * @returns Object with url, alt, and title, or null if no image found
 */
export async function getSuggestionImage(
  suggestionText: string
): Promise<{ url: string; alt: string; title: string } | null> {
  // Extract project name
  const projectName = extractProjectName(suggestionText);
  if (!projectName) {
    return null;
  }

  // Get entity ID
  const entityId = PROJECT_ENTITY_MAP[projectName];
  if (!entityId) {
    return null;
  }

  // Load manifest
  const manifest = await loadManifest();

  // Find assets
  const assets = findProjectAssets(manifest, entityId);
  if (assets.length === 0) {
    return null;
  }

  // Select best asset
  const asset = selectBestAsset(assets);
  if (!asset || !asset.blob_id || !asset.file_extension) {
    return null;
  }

  const signedUrl = await fetchSignedAssetUrl(asset.blob_id, asset.file_extension);
  if (!signedUrl) {
    return null;
  }

  return {
    url: signedUrl,
    alt: asset.caption || asset.title,
    title: asset.title,
  };
}
