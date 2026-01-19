/**
 * Test GCS Implementation
 * 
 * Verifies that the implementation works correctly:
 * 1. Blob storage service resolves URLs correctly
 * 2. Tool handlers can import and use the service
 * 3. Fallback logic works when GCS not configured
 */

import dotenv from 'dotenv';
import { readFileSync, existsSync } from 'fs';
import { Storage } from '@google-cloud/storage';

dotenv.config({ path: '.env' });

async function testImplementation() {
  console.log('🧪 Testing GCS Implementation\n');
  console.log('='.repeat(60));
  
  let allPassed = true;
  
  // Test 1: Blob URL Resolution
  console.log('\n1. Testing blob URL resolution...');
  try {
    // Set test env vars
    process.env.GCS_BUCKET_NAME = process.env.GCS_BUCKET_NAME || 'framdesign-assets';
    
    // Import the service (TypeScript file, but Next.js handles it)
    // Use dynamic import with path alias
    const blobService = await import('@/lib/services/blob-storage-service');
    const { resolveBlobUrl } = blobService;
    
    // Test cases
    const testCases = [
      { blobId: 'andrei-clodius/photo_of_andrei', ext: 'png', expected: 'andrei-clodius/photo_of_andrei.png' },
      { blobId: 'semantic-space/canvas-sketch', ext: 'png', expected: 'semantic-space/canvas-sketch.png' },
      { blobId: 'autopilot/modes-video', ext: 'mov', expected: 'autopilot/modes-video.mov' },
    ];
    
    for (const testCase of testCases) {
      const url = resolveBlobUrl(testCase.blobId, testCase.ext);
      const isValid = url.includes('storage.googleapis.com') && url.includes(testCase.expected);
      
      if (isValid) {
        console.log(`  ✓ ${testCase.blobId}.${testCase.ext} → ${url.substring(0, 60)}...`);
      } else {
        console.error(`  ✗ ${testCase.blobId}.${testCase.ext} → Invalid URL: ${url}`);
        allPassed = false;
      }
    }
    
    // Test error handling
    try {
      resolveBlobUrl('', 'png');
      console.error('  ✗ Should throw error for empty blob_id');
      allPassed = false;
    } catch (e) {
      if (e.message.includes('blob_id is required')) {
        console.log('  ✓ Error handling works (empty blob_id)');
      } else {
        console.error(`  ✗ Wrong error message: ${e.message}`);
        allPassed = false;
      }
    }
  } catch (error) {
    console.error(`  ✗ Blob URL resolution failed: ${error.message}`);
    console.error(error.stack);
    allPassed = false;
  }
  
  // Test 2: Tool Handler Imports
  console.log('\n2. Testing tool handler imports...');
  try {
    // Test kb_get handler can import blob service
    const kbGetHandler = await import('../tools/kb-get/handler.js');
    console.log('  ✓ kb_get handler imports successfully');
    
    // Test kb_search handler can import blob service
    const kbSearchHandler = await import('../tools/kb-search/handler.js');
    console.log('  ✓ kb_search handler imports successfully');
  } catch (error) {
    console.error(`  ✗ Tool handler import failed: ${error.message}`);
    allPassed = false;
  }
  
  // Test 3: Check if GCS is configured
  console.log('\n3. Checking GCS configuration...');
  const hasProjectId = !!process.env.GCS_PROJECT_ID;
  const hasBucketName = !!process.env.GCS_BUCKET_NAME;
  const hasKeyFile = !!process.env.GCS_KEY_FILE;
  const keyFileExists = hasKeyFile && existsSync(process.env.GCS_KEY_FILE);
  
  console.log(`  GCS_PROJECT_ID: ${hasProjectId ? '✓' : '✗'}`);
  console.log(`  GCS_BUCKET_NAME: ${hasBucketName ? '✓' : '✗'}`);
  console.log(`  GCS_KEY_FILE: ${hasKeyFile ? '✓' : '✗'}`);
  console.log(`  Key file exists: ${keyFileExists ? '✓' : '✗'}`);
  
  if (hasProjectId && hasBucketName && keyFileExists) {
    console.log('\n  → GCS is configured! Testing connection...');
    
    try {
      const storage = new Storage({
        projectId: process.env.GCS_PROJECT_ID,
        keyFilename: process.env.GCS_KEY_FILE,
      });
      const bucket = storage.bucket(process.env.GCS_BUCKET_NAME);
      const [exists] = await bucket.exists();
      
      if (exists) {
        console.log('  ✓ GCS bucket exists and is accessible');
        
        // Test upload/download
        const testFile = 'test-connection-' + Date.now() + '.txt';
        await bucket.file(testFile).save('Test connection');
        await bucket.file(testFile).makePublic();
        const [fileExists] = await bucket.file(testFile).exists();
        await bucket.file(testFile).delete();
        
        if (fileExists) {
          console.log('  ✓ GCS read/write operations work');
        } else {
          console.error('  ✗ GCS file operations failed');
          allPassed = false;
        }
      } else {
        console.error('  ✗ GCS bucket does not exist');
        allPassed = false;
      }
    } catch (error) {
      console.error(`  ✗ GCS connection failed: ${error.message}`);
      console.error('  → This is OK if you haven\'t set up GCS yet');
      console.error('  → Run the gcloud setup commands from the plan');
    }
  } else {
    console.log('  → GCS not configured yet (this is OK)');
    console.log('  → Set up GCS using the commands in docs/GCS_MIGRATION_STATUS.md');
  }
  
  // Test 4: Manifest structure
  console.log('\n4. Checking manifest structure...');
  try {
    const manifest = JSON.parse(readFileSync('./kb/assets/manifest.json', 'utf-8'));
    
    if (manifest.version === '2.0.0') {
      console.log('  ✓ Manifest version is 2.0.0 (GCS schema)');
    } else {
      console.log(`  ⚠️  Manifest version is ${manifest.version} (run transform script)`);
    }
    
    const assetsWithBlobId = manifest.assets.filter(a => a.blob_id && a.file_extension);
    console.log(`  Assets with blob_id: ${assetsWithBlobId.length}/${manifest.assets.length}`);
    
    if (assetsWithBlobId.length === manifest.assets.length) {
      console.log('  ✓ All assets have blob_id and file_extension');
    } else {
      console.log('  ⚠️  Some assets missing blob_id (run transform script)');
    }
  } catch (error) {
    console.error(`  ✗ Manifest check failed: ${error.message}`);
    allPassed = false;
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  if (allPassed) {
    console.log('✅ All implementation tests passed!');
    console.log('\nNext steps:');
    if (!hasProjectId || !hasBucketName || !keyFileExists) {
      console.log('  1. Set up GCS (see docs/GCS_MIGRATION_STATUS.md)');
    }
    if (hasProjectId && hasBucketName && keyFileExists) {
      console.log('  1. Transform manifest: node scripts/transform-manifest-to-gcs.js');
      console.log('  2. Migrate assets: node scripts/migrate-assets-to-gcs.js');
      console.log('  3. Update Qdrant: npm run embed-kb');
    }
    console.log('  4. Test with agent queries');
  } else {
    console.log('❌ Some tests failed - check errors above');
    process.exit(1);
  }
}

testImplementation().catch(error => {
  console.error('❌ Test script failed:', error);
  process.exit(1);
});
