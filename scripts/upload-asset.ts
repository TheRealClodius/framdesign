/**
 * Upload a single asset to Google Cloud Storage
 *
 * Usage:
 *   npx tsx scripts/upload-asset.ts <local-file-path> <blob-id> [--extension ext]
 *
 * Examples:
 *   npx tsx scripts/upload-asset.ts ~/images/hero.jpeg new-project/hero-shot
 *   npx tsx scripts/upload-asset.ts ~/images/diagram.png my-project/architecture --extension png
 *
 * The extension is auto-detected from the file path unless --extension is provided.
 * The file is uploaded to: gs://{bucket}/assets/{blob-id}.{extension}
 */

import dotenv from 'dotenv';
import { Storage } from '@google-cloud/storage';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

// --- CLI args ---

const args = process.argv.slice(2);
const extensionFlagIndex = args.indexOf('--extension');
let extensionOverride: string | null = null;

if (extensionFlagIndex !== -1) {
  extensionOverride = args[extensionFlagIndex + 1] || null;
  args.splice(extensionFlagIndex, 2);
}

const [localFilePath, blobId] = args;

if (!localFilePath || !blobId) {
  console.error('Usage: npx tsx scripts/upload-asset.ts <local-file-path> <blob-id> [--extension ext]');
  console.error('');
  console.error('Examples:');
  console.error('  npx tsx scripts/upload-asset.ts ~/images/hero.jpeg new-project/hero-shot');
  console.error('  npx tsx scripts/upload-asset.ts ./photo.png my-project/photo --extension png');
  process.exit(1);
}

// Resolve and validate local file
const resolvedPath = path.resolve(localFilePath);
if (!fs.existsSync(resolvedPath)) {
  console.error(`File not found: ${resolvedPath}`);
  process.exit(1);
}

// Determine extension
const extension = extensionOverride || path.extname(resolvedPath).slice(1).toLowerCase();
if (!extension) {
  console.error('Could not determine file extension. Use --extension to specify.');
  process.exit(1);
}

// --- GCS setup ---

const projectId = process.env.GCS_PROJECT_ID || process.env.VERTEXAI_PROJECT;
if (!projectId || !process.env.GCS_BUCKET_NAME) {
  console.error('Missing required environment variables:');
  console.error(`  GCS_PROJECT_ID: ${projectId ? 'set' : 'MISSING'}`);
  console.error(`  GCS_BUCKET_NAME: ${process.env.GCS_BUCKET_NAME ? 'set' : 'MISSING'}`);
  process.exit(1);
}

const storageConfig: { projectId: string; keyFilename?: string; credentials?: object } = { projectId };

if (process.env.GCS_KEY_FILE) {
  storageConfig.keyFilename = process.env.GCS_KEY_FILE;
}

if (process.env.GCS_SERVICE_ACCOUNT_KEY) {
  try {
    storageConfig.credentials = JSON.parse(
      Buffer.from(process.env.GCS_SERVICE_ACCOUNT_KEY, 'base64').toString()
    );
  } catch {
    console.error('Failed to parse GCS_SERVICE_ACCOUNT_KEY');
    process.exit(1);
  }
}

if (process.env.GOOGLE_APPLICATION_CREDENTIALS && !storageConfig.credentials && !storageConfig.keyFilename) {
  try {
    storageConfig.credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS);
  } catch {
    // File path — SDK handles via ADC
  }
}

const contentTypeMap: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  mov: 'video/quicktime',
  mp4: 'video/mp4',
};

// --- Upload ---

async function upload() {
  const storage = new Storage(storageConfig);
  const bucket = storage.bucket(process.env.GCS_BUCKET_NAME!);
  const gcsPath = `assets/${blobId}.${extension}`;
  const contentType = contentTypeMap[extension] || 'application/octet-stream';

  console.log(`Uploading: ${resolvedPath}`);
  console.log(`  Blob ID:      ${blobId}`);
  console.log(`  GCS path:     ${gcsPath}`);
  console.log(`  Content-Type: ${contentType}`);

  // Check if already exists
  const file = bucket.file(gcsPath);
  const [exists] = await file.exists();
  if (exists) {
    console.log(`  File already exists in GCS — overwriting.`);
  }

  await bucket.upload(resolvedPath, {
    destination: gcsPath,
    metadata: {
      contentType,
      cacheControl: 'public, max-age=31536000',
    },
  });

  console.log(`  Uploaded successfully.`);
}

upload().catch((error) => {
  console.error(`Upload failed: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
