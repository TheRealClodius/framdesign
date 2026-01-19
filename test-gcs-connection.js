import dotenv from 'dotenv';
import { existsSync } from 'fs';
import { Storage } from '@google-cloud/storage';

// Load env
dotenv.config({ path: '.env' });

async function testConnection() {
  console.log('Testing GCS connection...\n');
  
  const projectId = process.env.GCS_PROJECT_ID || process.env.VERTEXAI_PROJECT;
  const bucketName = process.env.GCS_BUCKET_NAME;
  
  if (!projectId || !bucketName) {
    console.error('❌ Missing required environment variables:');
    console.error('   Project ID (GCS_PROJECT_ID or VERTEXAI_PROJECT):', projectId ? '✓' : '✗');
    console.error('   GCS_BUCKET_NAME:', bucketName ? '✓' : '✗');
    console.error('\nPlease set these in .env file');
    console.error('Note: Can use VERTEXAI_PROJECT if already set for Vertex AI');
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
  
  // Initialize storage client
  const storage = new Storage(storageConfig);
  const bucket = storage.bucket(bucketName);
  
  // Test 1: Check bucket exists
  const [exists] = await bucket.exists();
  console.log(`✓ Bucket exists: ${exists}`);
  
  if (!exists) {
    throw new Error('Bucket does not exist!');
  }
  
  // Test 2: Upload test file
  const testFile = 'test-file.txt';
  const testContent = `Hello from Framdesign! Test upload at ${new Date().toISOString()}`;
  await bucket.file(testFile).save(testContent);
  console.log(`✓ Upload successful: ${testFile}`);
  
  // Test 3: Make file public (may fail if public access prevention is enabled)
  try {
    await bucket.file(testFile).makePublic();
    console.log('✓ File made public');
  } catch (error) {
    if (error.message.includes('public access prevention')) {
      console.log('⚠️  Cannot make file public (public access prevention enabled)');
      console.log('   Individual files can still be accessed via signed URLs or direct access');
    } else {
      throw error;
    }
  }
  
  // Test 4: Generate public URL
  const publicUrl = `https://storage.googleapis.com/${bucketName}/${testFile}`;
  console.log(`✓ Public URL: ${publicUrl}`);
  
  // Test 5: Verify file exists
  const [fileExists] = await bucket.file(testFile).exists();
  console.log(`✓ File exists in bucket: ${fileExists}`);
  
  // Test 6: Cleanup
  await bucket.file(testFile).delete();
  console.log('✓ Cleanup successful\n');
  
  console.log('🎉 All GCS connection tests passed!');
  console.log('\nYou can now proceed with the migration.');
}

testConnection().catch(error => {
  console.error('❌ GCS connection test failed:', error.message);
  process.exit(1);
});
