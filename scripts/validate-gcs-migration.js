/**
 * Validate GCS Migration
 * 
 * Verifies that all assets in manifest exist in GCS and are accessible.
 */

import dotenv from 'dotenv';
import { Storage } from '@google-cloud/storage';

dotenv.config({ path: '.env' });
import https from 'https';
import http from 'http';

// Validate environment variables
const projectId = process.env.GCS_PROJECT_ID || process.env.VERTEXAI_PROJECT;
if (!projectId || !process.env.GCS_BUCKET_NAME) {
  console.error('❌ Missing required environment variables');
  console.error('   Project ID (GCS_PROJECT_ID or VERTEXAI_PROJECT):', projectId ? '✓' : '✗');
  console.error('   GCS_BUCKET_NAME:', process.env.GCS_BUCKET_NAME ? '✓' : '✗');
  console.error('   Please set these in .env file');
  console.error('   Note: Can use VERTEXAI_PROJECT if already set for Vertex AI');
  process.exit(1);
}

// Build Storage config - supports multiple credential methods
const storageConfig = {
  projectId: projectId,
};

// Use explicit key file if provided, otherwise rely on GOOGLE_APPLICATION_CREDENTIALS (ADC)
if (process.env.GCS_KEY_FILE) {
  storageConfig.keyFilename = process.env.GCS_KEY_FILE;
}

const storage = new Storage(storageConfig);

const bucket = storage.bucket(process.env.GCS_BUCKET_NAME);
import fs from 'fs';
const manifest = JSON.parse(fs.readFileSync('./kb/assets/manifest.json', 'utf-8'));

function checkUrlAccessibility(url) {
  return new Promise((resolve) => {
    const protocol = url.startsWith('https') ? https : http;
    const req = protocol.get(url, { timeout: 5000 }, (res) => {
      resolve({
        status: res.statusCode,
        accessible: res.statusCode === 200,
      });
    });
    
    req.on('error', () => {
      resolve({ status: 0, accessible: false });
    });
    
    req.on('timeout', () => {
      req.destroy();
      resolve({ status: 0, accessible: false });
    });
  });
}

async function validateMigration() {
  console.log(`Validating ${manifest.assets.length} assets in GCS...\n`);
  
  const results = {
    exists: [],
    missing: [],
    inaccessible: [],
  };
  
  for (const asset of manifest.assets) {
    if (!asset.blob_id || !asset.file_extension) {
      console.log(`⚠️  ${asset.id}: Missing blob_id or file_extension`);
      results.missing.push(asset.id);
      continue;
    }
    
    const fileName = `assets/${asset.blob_id}.${asset.file_extension}`;
    const file = bucket.file(fileName);
    
    try {
      // Check if file exists in GCS
      const [exists] = await file.exists();
      
      if (!exists) {
        console.log(`❌ ${asset.id}: File not found in GCS`);
        console.log(`   Expected: ${fileName}`);
        results.missing.push({
          id: asset.id,
          expected: fileName,
        });
        continue;
      }
      
      // Generate signed URL (since we're using signed URLs, not public URLs)
      try {
        const [signedUrl] = await file.getSignedUrl({
          action: 'read',
          expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
        });
        
        // Test signed URL accessibility
        const urlCheck = await checkUrlAccessibility(signedUrl);
        
        if (!urlCheck.accessible) {
          console.log(`⚠️  ${asset.id}: File exists but signed URL not accessible (status: ${urlCheck.status})`);
          results.inaccessible.push({
            id: asset.id,
            status: urlCheck.status,
          });
        } else {
          console.log(`✓ ${asset.id}: File exists and signed URL is accessible`);
          results.exists.push({
            id: asset.id,
          });
        }
      } catch (urlError) {
        console.log(`⚠️  ${asset.id}: Failed to generate signed URL: ${urlError.message}`);
        results.inaccessible.push({
          id: asset.id,
          error: urlError.message,
        });
      }
    } catch (error) {
      console.error(`❌ ${asset.id}: Error checking - ${error.message}`);
      results.missing.push({
        id: asset.id,
        error: error.message,
      });
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('Validation Summary:');
  console.log(`  ✓ Exists & Accessible: ${results.exists.length}`);
  console.log(`  ❌ Missing: ${results.missing.length}`);
  console.log(`  ⚠️  Inaccessible: ${results.inaccessible.length}`);
  console.log('='.repeat(60));
  
  if (results.missing.length > 0) {
    console.log('\nMissing Assets:');
    results.missing.forEach(item => {
      if (typeof item === 'string') {
        console.log(`  - ${item}`);
      } else {
        console.log(`  - ${item.id}: ${item.expected || item.error}`);
      }
    });
  }
  
  if (results.inaccessible.length > 0) {
    console.log('\nInaccessible URLs:');
    results.inaccessible.forEach(item => {
      console.log(`  - ${item.id}: ${item.url} (status: ${item.status})`);
    });
  }
  
  if (results.exists.length === manifest.assets.length) {
    console.log('\n🎉 All assets validated successfully!');
  } else {
    console.log('\n⚠️  Some assets need attention');
    process.exit(1);
  }
}

validateMigration().catch(error => {
  console.error('❌ Validation failed:', error);
  process.exit(1);
});
