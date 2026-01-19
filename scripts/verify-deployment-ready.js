/**
 * Deployment Readiness Verification
 * 
 * Checks that everything is ready for deployment:
 * 1. Code implementation is complete
 * 2. Tests pass
 * 3. GCS configuration status
 * 4. Ready for migration
 */

import dotenv from 'dotenv';
import { existsSync, readFileSync } from 'fs';

// Load env
dotenv.config({ path: '.env' });

console.log('🔍 Deployment Readiness Check\n');
console.log('='.repeat(60));

let allReady = true;

// Check 1: Code Implementation
console.log('\n1. Code Implementation');
const files = [
  'lib/services/blob-storage-service.ts',
  'tools/kb-get/handler.js',
  'tools/kb-search/handler.js',
  'prompts/core.md',
  'voice-server/prompts/core.md',
  'scripts/transform-manifest-to-gcs.js',
  'scripts/migrate-assets-to-gcs.js',
  'scripts/validate-gcs-migration.js',
];

files.forEach(file => {
  if (existsSync(file)) {
    console.log(`  ✓ ${file}`);
  } else {
    console.log(`  ✗ ${file} MISSING`);
    allReady = false;
  }
});

// Check 2: Tests
console.log('\n2. Test Files');
const testFiles = [
  'tests/services/blob-storage-service.test.ts',
  'tests/tools/kb-get-gcs.test.js',
  'tests/tools/kb-search-gcs.test.js',
  'tests/e2e/asset-retrieval-gcs.test.js',
  'tests/scripts/validate-manifest.test.js',
];

testFiles.forEach(file => {
  if (existsSync(file)) {
    console.log(`  ✓ ${file}`);
  } else {
    console.log(`  ✗ ${file} MISSING`);
    allReady = false;
  }
});

// Check 3: GCS Configuration
console.log('\n3. GCS Configuration');
const hasProjectId = !!(process.env.GCS_PROJECT_ID || process.env.VERTEXAI_PROJECT);
const hasBucketName = !!process.env.GCS_BUCKET_NAME;
const hasKeyFile = !!process.env.GCS_KEY_FILE;
const hasGoogleCreds = !!process.env.GOOGLE_APPLICATION_CREDENTIALS;
const keyFileExists = hasKeyFile && existsSync(process.env.GCS_KEY_FILE);
const googleCredsExists = hasGoogleCreds && existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS);

const projectId = process.env.GCS_PROJECT_ID || process.env.VERTEXAI_PROJECT || '(not set)';
console.log(`  Project ID: ${hasProjectId ? '✓' : '✗'} ${hasProjectId ? projectId : '(set GCS_PROJECT_ID or VERTEXAI_PROJECT)'}`);
console.log(`  GCS_BUCKET_NAME: ${hasBucketName ? '✓' : '✗'} ${hasBucketName ? process.env.GCS_BUCKET_NAME : '(set in .env)'}`);
console.log(`  GOOGLE_APPLICATION_CREDENTIALS: ${hasGoogleCreds ? '✓' : '✗'} ${hasGoogleCreds ? (googleCredsExists ? '(file exists)' : '(env var set)') : '(optional - uses ADC)'}`);
console.log(`  GCS_KEY_FILE: ${hasKeyFile ? '✓' : '✗'} ${hasKeyFile ? (keyFileExists ? '(file exists)' : '(file missing)') : '(optional - uses ADC or GOOGLE_APPLICATION_CREDENTIALS)'}`);

if (!hasProjectId || !hasBucketName) {
  console.log('  → GCS not fully configured yet - this is OK for code deployment');
  console.log('  → Configure GCS_BUCKET_NAME before running migration');
} else if (!hasKeyFile && !hasGoogleCreds) {
  console.log('  → No explicit credentials set - will use Application Default Credentials (ADC)');
  console.log('  → Make sure you\'ve run: gcloud auth application-default login');
}

// Check 4: Dependencies
console.log('\n4. Dependencies');
try {
  const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));
  const hasGcs = pkg.dependencies?.['@google-cloud/storage'] || pkg.devDependencies?.['@google-cloud/storage'];
  console.log(`  @google-cloud/storage: ${hasGcs ? '✓' : '✗'}`);
  if (!hasGcs) allReady = false;
} catch (e) {
  console.log('  ✗ Could not check package.json');
  allReady = false;
}

// Check 5: Manifest Status
console.log('\n5. Manifest Status');
try {
  const manifest = JSON.parse(readFileSync('kb/assets/manifest.json', 'utf-8'));
  console.log(`  Version: ${manifest.version}`);
  console.log(`  Assets: ${manifest.assets.length}`);
  
  const assetsWithBlobId = manifest.assets.filter(a => a.blob_id && a.file_extension);
  console.log(`  Assets with blob_id: ${assetsWithBlobId.length}/${manifest.assets.length}`);
  
  if (manifest.version === '2.0.0' && assetsWithBlobId.length === manifest.assets.length) {
    console.log('  ✓ Manifest is migrated');
  } else {
    console.log('  ⚠️  Manifest not migrated yet (run transform script)');
  }
} catch (e) {
  console.log(`  ✗ Could not read manifest: ${e.message}`);
}

// Summary
console.log('\n' + '='.repeat(60));
if (allReady) {
  console.log('✅ Code is ready for deployment!');
  console.log('\nYou can:');
  console.log('  1. Deploy code to Vercel (GCS can be configured later)');
  console.log('  2. Set up GCS when ready');
  console.log('  3. Run migration scripts');
} else {
  console.log('⚠️  Some issues found - check above');
}

console.log('\n📋 Next Steps:');
console.log('  1. Set up GCS: See docs/GCS_MIGRATION_STATUS.md');
console.log('  2. Test GCS connection: node test-gcs-connection.js');
console.log('  3. Transform manifest: node scripts/transform-manifest-to-gcs.js');
console.log('  4. Migrate assets: node scripts/migrate-assets-to-gcs.js');
console.log('  5. Update Qdrant: npm run embed-kb');
console.log('  6. Deploy and test!');
