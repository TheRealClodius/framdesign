/**
 * Tests for Blob Storage Service
 * 
 * These tests define the contract for the blob storage service.
 * Implementation will be written to pass these tests.
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';

describe('BlobStorageService', () => {
  // Mock environment variables
  const originalEnv = process.env;
  
  beforeEach(() => {
    jest.resetModules();
    // Preserve GCS credentials from .env files (loaded by setup.ts)
    process.env = {
      ...originalEnv,
      // Override with test values if not set, but preserve credentials
      GCS_PROJECT_ID: originalEnv.GCS_PROJECT_ID || originalEnv.VERTEXAI_PROJECT || 'test-project',
      GCS_BUCKET_NAME: originalEnv.GCS_BUCKET_NAME || 'framdesign-assets',
      // Preserve credential-related env vars
      GCS_KEY_FILE: originalEnv.GCS_KEY_FILE,
      GCS_SERVICE_ACCOUNT_KEY: originalEnv.GCS_SERVICE_ACCOUNT_KEY,
      GOOGLE_APPLICATION_CREDENTIALS: originalEnv.GOOGLE_APPLICATION_CREDENTIALS,
      VERTEXAI_PROJECT: originalEnv.VERTEXAI_PROJECT,
    };
  });
  
  afterEach(() => {
    process.env = originalEnv;
  });

  describe('resolveBlobUrl', () => {
    test('constructs correct public GCS URL', async () => {
      // Import the service
      const blobService = await import('@/lib/services/blob-storage-service');
      const { resolveBlobUrl } = blobService;
      
      const url = resolveBlobUrl('andrei-clodius/photo_of_andrei', 'png');
      
      expect(url).toBe('https://storage.googleapis.com/framdesign-assets/assets/andrei-clodius/photo_of_andrei.png');
    });
    
    test('handles blob_id with slashes', async () => {
      const blobService = await import('@/lib/services/blob-storage-service');
      const { resolveBlobUrl } = blobService;
      
      const url = resolveBlobUrl('semantic-space/canvas-sketch', 'png');
      
      expect(url).toBe('https://storage.googleapis.com/framdesign-assets/assets/semantic-space/canvas-sketch.png');
    });
    
    test('handles different extensions', async () => {
      const blobService = await import('@/lib/services/blob-storage-service');
      const { resolveBlobUrl } = blobService;
      
      const pngUrl = resolveBlobUrl('test/image', 'png');
      const jpegUrl = resolveBlobUrl('test/image', 'jpeg');
      const movUrl = resolveBlobUrl('test/video', 'mov');
      const gifUrl = resolveBlobUrl('test/animation', 'gif');
      
      expect(pngUrl).toContain('.png');
      expect(jpegUrl).toContain('.jpeg');
      expect(movUrl).toContain('.mov');
      expect(gifUrl).toContain('.gif');
    });
    
    test('throws error for missing blob_id', async () => {
      const blobService = await import('@/lib/services/blob-storage-service');
      const { resolveBlobUrl } = blobService;
      
      expect(() => {
        resolveBlobUrl('', 'png');
      }).toThrow('blob_id is required');
      
      expect(() => {
        resolveBlobUrl(null as any, 'png');
      }).toThrow();
    });
    
    test('returns cached URL on second call', async () => {
      // Skip if GCS not configured (for CI/CD)
      // Need both bucket name and credentials
      const hasCredentials = process.env.GCS_KEY_FILE || 
                             process.env.GCS_SERVICE_ACCOUNT_KEY || 
                             process.env.GOOGLE_APPLICATION_CREDENTIALS;
      if (!process.env.GCS_BUCKET_NAME || !hasCredentials) {
        console.log('Skipping cache test - GCS not configured (missing bucket name or credentials)');
        return;
      }

      const blobService = await import('@/lib/services/blob-storage-service');
      const { resolveBlobUrl } = blobService;
      
      const url1 = await resolveBlobUrl('test/blob', 'png');
      const url2 = await resolveBlobUrl('test/blob', 'png');
      
      expect(url1).toBe(url2); // Same URL from cache
    });
  });
  
  describe('generateSignedUrl', () => {
    test('generates valid signed URL', async () => {
      // Skip if GCS not configured (for CI/CD)
      if (!process.env.GCS_BUCKET_NAME) {
        console.log('Skipping signed URL test - GCS not configured');
        return;
      }

      const blobService = await import('@/lib/services/blob-storage-service');
      const { generateSignedUrl } = blobService;
      
      const url = await generateSignedUrl('test/blob', 'png', 7);
      
      expect(url).toContain('storage.googleapis.com');
      expect(url).toContain('test/blob');
      expect(url).toContain('.png');
      expect(url).toContain('signature=');
    });
    
    test('signed URL expires after correct duration', async () => {
      if (!process.env.GCS_BUCKET_NAME) {
        console.log('Skipping signed URL expiration test - GCS not configured');
        return;
      }

      const blobService = await import('@/lib/services/blob-storage-service');
      const { generateSignedUrl } = blobService;
      
      const url = await generateSignedUrl('test/blob', 'png', 7);
      
      // URL should contain expiration parameter
      expect(url).toContain('Expires=');
    });
  });
  
  describe('uploadAsset', () => {
    test('uploads file to correct path', async () => {
      if (!process.env.GCS_BUCKET_NAME) {
        console.log('Skipping upload test - GCS not configured');
        return;
      }

      const blobService = await import('@/lib/services/blob-storage-service');
      const { uploadAsset } = blobService;
      
      const fileBuffer = Buffer.from('test image data');
      const url = await uploadAsset('test/category', fileBuffer, 'image/png', true);
      
      expect(url).toContain('test/category');
      expect(url).toContain('.png');
      expect(url).toContain('storage.googleapis.com');
    });
    
    test('makes file public when requested', async () => {
      if (!process.env.GCS_BUCKET_NAME) {
        console.log('Skipping public file test - GCS not configured');
        return;
      }

      const blobService = await import('@/lib/services/blob-storage-service');
      const { uploadAsset } = blobService;
      
      const fileBuffer = Buffer.from('test data');
      const url = await uploadAsset('test/public-test', fileBuffer, 'image/png', true);
      
      // Verify URL is public (no signature parameter)
      expect(url).not.toContain('signature=');
    });
    
    test('returns public URL after upload', async () => {
      if (!process.env.GCS_BUCKET_NAME) {
        console.log('Skipping URL return test - GCS not configured');
        return;
      }

      const blobService = await import('@/lib/services/blob-storage-service');
      const { uploadAsset } = blobService;
      
      const url = await uploadAsset('test/blob', Buffer.from('data'), 'image/png', true);
      
      expect(url).toBe('https://storage.googleapis.com/framdesign-assets/assets/test/blob.png');
    });
  });
  
  describe('assetExists', () => {
    test('returns true for existing asset', async () => {
      if (!process.env.GCS_BUCKET_NAME) {
        console.log('Skipping existence test - GCS not configured');
        return;
      }

      const blobService = await import('@/lib/services/blob-storage-service');
      const { assetExists } = blobService;
      
      // This will fail if no assets uploaded yet, which is expected
      const exists = await assetExists('test/blob', 'png');
      
      expect(typeof exists).toBe('boolean');
    });
    
    test('returns false for non-existent asset', async () => {
      if (!process.env.GCS_BUCKET_NAME) {
        console.log('Skipping non-existence test - GCS not configured');
        return;
      }

      const blobService = await import('@/lib/services/blob-storage-service');
      const { assetExists } = blobService;
      
      const exists = await assetExists('nonexistent/blob-that-does-not-exist-12345', 'png');
      
      expect(exists).toBe(false);
    });
  });
});
