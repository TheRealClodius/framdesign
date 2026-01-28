/**
 * Migrate assets from local filesystem to Google Cloud Storage
 * 
 * Reads transformed manifest.json and uploads all assets to GCS.
 */

import dotenv from 'dotenv';
import { Storage } from '@google-cloud/storage';
import fs from 'fs';
import path from 'path';

dotenv.config({ path: '.env' });

// Validate environment variables
const projectId = process.env.GCS_PROJECT_ID || process.env.VERTEXAI_PROJECT;
if (!projectId || !process.env.GCS_BUCKET_NAME) {
  console.error('❌ Missing required environment variables:');
  console.error('   Project ID (GCS_PROJECT_ID or VERTEXAI_PROJECT):', projectId ? '✓' : '✗');
  console.error('   GCS_BUCKET_NAME:', process.env.GCS_BUCKET_NAME ? '✓' : '✗');
  console.error('\nPlease set these in .env file');
  console.error('Note: Can use VERTEXAI_PROJECT if already set for Vertex AI');
  process.exit(1);
}

// Build Storage config - supports multiple credential methods
const storageConfig = {
  projectId: projectId,
};

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

// Determine content type from extension
function getContentType(extension) {
  const contentTypeMap = {
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'mov': 'video/quicktime',
    'mp4': 'video/mp4',
    'webp': 'image/webp',
  };
  return contentTypeMap[extension.toLowerCase()] || 'application/octet-stream';
}

async function migrateAssets() {
  console.log(`Migrating ${manifest.assets.length} assets to GCS...\n`);
  
  const results = {
    success: [],
    skipped: [],
    errors: [],
  };
  
  for (const asset of manifest.assets) {
    const localPath = `./public${asset._old_path || asset.path}`;
    const gcsPath = `assets/${asset.blob_id}.${asset.file_extension}`;
    
    console.log(`Uploading: ${asset.id}`);
    console.log(`  Local: ${localPath}`);
    console.log(`  GCS: ${gcsPath}`);
    
    // Check if blob_id exists
    if (!asset.blob_id || !asset.file_extension) {
      console.error(`  ❌ Missing blob_id or file_extension`);
      results.errors.push({
        asset: asset.id,
        reason: 'Missing blob_id or file_extension',
      });
      continue;
    }
    
    // Check local file exists
    if (!fs.existsSync(localPath)) {
      console.error(`  ❌ Local file not found!`);
      results.errors.push({
        asset: asset.id,
        reason: 'Local file not found',
        path: localPath,
      });
      continue;
    }
    
    try {
      // Check if file already exists in GCS
      const file = bucket.file(gcsPath);
      const [exists] = await file.exists();
      
      if (exists) {
        console.log(`  ⚠️  File already exists in GCS, skipping...`);
        results.skipped.push({
          asset: asset.id,
          reason: 'Already exists in GCS',
        });
        continue;
      }
      
      // Upload to GCS
      const contentType = getContentType(asset.file_extension);
      await bucket.upload(localPath, {
        destination: gcsPath,
        metadata: {
          contentType,
          cacheControl: 'public, max-age=31536000', // 1 year
        },
      });
      
      // Files are private - we'll use signed URLs for access
      // No need to make public since public access prevention is enabled
      console.log(`  ✓ Uploaded (using signed URLs for access)\n`);
      
      results.success.push({
        asset: asset.id,
      });
    } catch (error) {
      console.error(`  ❌ Upload failed: ${error.message}\n`);
      results.errors.push({
        asset: asset.id,
        reason: error.message,
      });
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('Migration Summary:');
  console.log(`  ✓ Success: ${results.success.length}`);
  console.log(`  ⚠️  Skipped: ${results.skipped.length}`);
  console.log(`  ❌ Errors: ${results.errors.length}`);
  console.log('='.repeat(60));
  
  if (results.errors.length > 0) {
    console.log('\nErrors:');
    results.errors.forEach(err => {
      console.log(`  - ${err.asset}: ${err.reason}`);
    });
  }
  
  if (results.success.length > 0) {
    console.log('\n🎉 Migration complete!');
    console.log(`\nNext step: Run 'npm run embed-kb' to update Qdrant with blob_ids`);
  }
}

migrateAssets().catch(error => {
  console.error('❌ Migration failed:', error);
  process.exit(1);
});
