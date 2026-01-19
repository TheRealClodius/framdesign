/**
 * Transform manifest.json to GCS schema
 * 
 * Converts filesystem paths to blob_ids and adds GCS metadata fields.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const manifestPath = './kb/assets/manifest.json';
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

console.log(`Transforming manifest with ${manifest.assets.length} assets...\n`);

// Add schema documentation
manifest._schema = {
  blob_id: "Stable identifier for GCS storage (category/filename without extension)",
  file_extension: "File extension (png, jpeg, mov, gif)",
  storage_provider: "Always 'gcs' for Google Cloud Storage"
};

manifest._ID_MAPPING_RULES = {
  description: "How to maintain ID <> asset mapping when updating assets",
  rules: [
    "1. blob_id format: {category}/{filename-slug} (no extension)",
    "2. Category matches folder: andrei-clodius/, semantic-space/, etc.",
    "3. Filename slug: lowercase, hyphens instead of spaces, descriptive",
    "4. blob_id is STABLE - never change it (URLs will break)",
    "5. To rename: Keep blob_id, update title/description only",
    "6. To replace: Upload new file with SAME blob_id (overwrites in GCS)",
    "7. file_extension must match actual file in GCS"
  ],
  examples: {
    good_blob_ids: [
      "andrei-clodius/photo_of_andrei",
      "semantic-space/canvas-sketch",
      "autopilot/context-structure-sketch"
    ],
    bad_blob_ids: [
      "photo.png",
      "Semantic Space Sketch",
      "2024-01-15-image"
    ]
  }
};

// Transform each asset
let transformedCount = 0;
let skippedCount = 0;

manifest.assets = manifest.assets.map((asset) => {
  // Skip if already transformed (has blob_id)
  if (asset.blob_id) {
    skippedCount++;
    return asset;
  }
  
  // Derive blob_id from old path
  // Example: "/kb-assets/andrei-clodius/photo_of_andrei.png" 
  //       -> "andrei-clodius/photo_of_andrei"
  if (!asset.path || !asset.path.startsWith('/kb-assets/')) {
    console.warn(`⚠️  Asset ${asset.id} has invalid path: ${asset.path}`);
    skippedCount++;
    return asset;
  }
  
  const pathWithoutPrefix = asset.path.replace('/kb-assets/', '');
  const pathParts = pathWithoutPrefix.split('/');
  
  if (pathParts.length !== 2) {
    console.warn(`⚠️  Asset ${asset.id} has unexpected path structure: ${asset.path}`);
    skippedCount++;
    return asset;
  }
  
  const category = pathParts[0];
  const filenameWithExt = pathParts[1];
  const parsedPath = path.parse(filenameWithExt);
  const filename = parsedPath.name;
  const extension = parsedPath.ext.substring(1); // Remove leading dot
  
  // Create blob_id: category/filename-slug
  // Convert spaces to hyphens, ensure lowercase
  const filenameSlug = filename
    .replace(/\s+/g, '-')
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, ''); // Remove special chars except hyphens and underscores
  
  const blob_id = `${category}/${filenameSlug}`;
  
  transformedCount++;
  
  return {
    ...asset,
    blob_id,
    file_extension: extension,
    storage_provider: 'gcs',
    // Keep path temporarily for migration, remove later
    _old_path: asset.path
  };
});

// Update version
manifest.version = '2.0.0';

// Backup original manifest
const backupPath = './kb/assets/manifest.v1.backup.json';
if (!fs.existsSync(backupPath)) {
  fs.writeFileSync(backupPath, JSON.stringify(JSON.parse(fs.readFileSync(manifestPath, 'utf-8')), null, 2));
  console.log(`✓ Backup created: ${backupPath}\n`);
}

// Save transformed manifest
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`✓ Manifest transformed to GCS schema`);
console.log(`✓ ${transformedCount} assets transformed`);
if (skippedCount > 0) {
  console.log(`⚠️  ${skippedCount} assets skipped (already transformed or invalid)`);
}
console.log(`\nNext step: Run 'node scripts/migrate-assets-to-gcs.js' to upload assets to GCS`);
