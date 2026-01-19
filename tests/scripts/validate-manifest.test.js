/**
 * Tests for Asset Manifest Validation
 * 
 * These tests verify that the manifest.json structure
 * is correct and all referenced assets exist.
 */

import { describe, test, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('Asset Manifest Validation', () => {
  let manifest;

  beforeAll(() => {
    const manifestPath = resolve(process.cwd(), 'kb/assets/manifest.json');
    manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  });

  test('all assets have required fields', () => {
    manifest.assets.forEach((asset, index) => {
      expect(asset.id, `Asset ${index} missing id`).toBeDefined();
      expect(asset.blob_id, `Asset ${index} (${asset.id}) missing blob_id`).toBeDefined();
      expect(asset.file_extension, `Asset ${index} (${asset.id}) missing file_extension`).toBeDefined();
      expect(asset.storage_provider, `Asset ${index} (${asset.id}) missing storage_provider`).toBeDefined();
      
      // blob_id should be a string
      expect(typeof asset.blob_id).toBe('string');
      expect(asset.blob_id.length).toBeGreaterThan(0);
      
      // file_extension should be a string
      expect(typeof asset.file_extension).toBe('string');
      expect(['png', 'jpeg', 'jpg', 'mov', 'gif']).toContain(asset.file_extension.toLowerCase());
      
      // storage_provider should be 'gcs'
      expect(asset.storage_provider).toBe('gcs');
    });
  });

  test('blob_ids follow naming convention', () => {
    manifest.assets.forEach((asset) => {
      const blobId = asset.blob_id;
      
      // Should contain a slash (category/filename format)
      expect(blobId).toMatch(/\//);
      
      // Should not contain spaces
      expect(blobId).not.toContain(' ');
      
      // Should be lowercase
      expect(blobId).toBe(blobId.toLowerCase());
      
      // Should not contain file extension
      expect(blobId).not.toMatch(/\.(png|jpeg|jpg|mov|gif)$/);
      
      // Should not start or end with slash
      expect(blobId).not.toMatch(/^\/|\/$/);
    });
  });

  test('no duplicate blob_ids', () => {
    const blobIds = manifest.assets.map(a => a.blob_id);
    const uniqueBlobIds = new Set(blobIds);
    
    expect(blobIds.length).toBe(uniqueBlobIds.size);
    
    // If duplicates found, report them
    if (blobIds.length !== uniqueBlobIds.size) {
      const duplicates = blobIds.filter((id, index) => blobIds.indexOf(id) !== index);
      console.error('Duplicate blob_ids found:', duplicates);
    }
  });

  test('all referenced files exist in GCS', async () => {
    // Skip if GCS not configured
    if (!process.env.GCS_BUCKET_NAME || !process.env.GCS_PROJECT_ID) {
      console.log('Skipping GCS existence check - GCS not configured');
      return;
    }

    const { Storage } = require('@google-cloud/storage');
    const storage = new Storage({
      projectId: process.env.GCS_PROJECT_ID,
      keyFilename: process.env.GCS_KEY_FILE,
    });
    const bucket = storage.bucket(process.env.GCS_BUCKET_NAME);

    const missingAssets = [];

    for (const asset of manifest.assets) {
      const fileName = `assets/${asset.blob_id}.${asset.file_extension}`;
      const file = bucket.file(fileName);
      const [exists] = await file.exists();
      
      if (!exists) {
        missingAssets.push({
          id: asset.id,
          blob_id: asset.blob_id,
          file_extension: asset.file_extension,
          expected_path: fileName,
        });
      }
    }

    if (missingAssets.length > 0) {
      console.error('Missing assets in GCS:', missingAssets);
    }

    expect(missingAssets.length).toBe(0);
  });

  test('manifest has schema documentation', () => {
    expect(manifest._schema).toBeDefined();
    expect(manifest._ID_MAPPING_RULES).toBeDefined();
  });

  test('manifest version is 2.0.0', () => {
    expect(manifest.version).toBe('2.0.0');
  });
});
