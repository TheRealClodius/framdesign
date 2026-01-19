/**
 * Quick check: Are autopilot assets in GCS?
 */

import dotenv from 'dotenv';
import { Storage } from '@google-cloud/storage';
import fs from 'fs';

dotenv.config({ path: '.env' });

const projectId = process.env.GCS_PROJECT_ID || process.env.VERTEXAI_PROJECT;
if (!projectId || !process.env.GCS_BUCKET_NAME) {
  console.error('❌ Missing GCS configuration');
  process.exit(1);
}

const storageConfig = { projectId };

// Priority 1: Explicit key file (for local dev override)
if (process.env.GCS_KEY_FILE) {
  storageConfig.keyFilename = process.env.GCS_KEY_FILE;
}

// Priority 2: Base64 encoded service account key (for Vercel)
if (process.env.GCS_SERVICE_ACCOUNT_KEY) {
  try {
    storageConfig.credentials = JSON.parse(
      Buffer.from(process.env.GCS_SERVICE_ACCOUNT_KEY, 'base64').toString()
    );
  } catch (error) {
    console.error('Failed to parse GCS_SERVICE_ACCOUNT_KEY:', error);
    process.exit(1);
  }
}

// Priority 3: GOOGLE_APPLICATION_CREDENTIALS as JSON string (for Vercel)
// If it's a JSON string, parse it; otherwise SDK will use it as file path (ADC)
if (process.env.GOOGLE_APPLICATION_CREDENTIALS && !storageConfig.credentials && !storageConfig.keyFilename) {
  try {
    // Try to parse as JSON string (Vercel stores JSON as string in env vars)
    const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS);
    storageConfig.credentials = credentials;
  } catch {
    // Not JSON - it's a file path, SDK will use it via ADC
    // No explicit config needed - SDK handles it automatically
  }
}

const storage = new Storage(storageConfig);
const bucket = storage.bucket(process.env.GCS_BUCKET_NAME);
const manifest = JSON.parse(fs.readFileSync('./kb/assets/manifest.json', 'utf-8'));

// Filter autopilot assets
const autopilotAssets = manifest.assets.filter(asset => 
  asset.id.includes('autopilot') || 
  asset.blob_id?.startsWith('autopilot/')
);

console.log(`Checking ${autopilotAssets.length} autopilot assets...\n`);

for (const asset of autopilotAssets) {
  const gcsPath = `assets/${asset.blob_id}.${asset.file_extension}`;
  const file = bucket.file(gcsPath);
  
  try {
    const [exists] = await file.exists();
    const status = exists ? '✓ EXISTS' : '❌ MISSING';
    console.log(`${status} ${asset.id}`);
    console.log(`   blob_id: ${asset.blob_id}`);
    console.log(`   GCS path: ${gcsPath}`);
    console.log(`   Local: ${asset._old_path || asset.path}\n`);
  } catch (error) {
    console.log(`❌ ERROR ${asset.id}: ${error.message}\n`);
  }
}
