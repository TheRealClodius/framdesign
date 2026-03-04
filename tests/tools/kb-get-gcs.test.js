/**
 * Tests for kb_get tool with GCS assets
 *
 * These tests verify that kb_get emits stable /kb-assets/ references
 * (not signed GCS URLs) and correctly detects dead assets.
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';

// Mock the blob storage service — handler uses resolveBlobUrlSafe for dead asset detection
const mockResolveBlobUrlSafe = jest.fn((blobId, extension) => {
  return {
    url: `https://storage.googleapis.com/framdesign-assets/assets/${blobId}.${extension}`,
    exists: true,
  };
});

jest.mock('@/lib/services/blob-storage-service', () => ({
  resolveBlobUrlSafe: mockResolveBlobUrlSafe,
  fetchAssetBuffer: jest.fn(),
  generateSignedUrl: jest.fn(),
  uploadAsset: jest.fn(),
  assetExists: jest.fn(),
}));

describe('kb_get with GCS assets', () => {
  let execute;

  beforeEach(async () => {
    jest.clearAllMocks();
    const handler = await import('../../tools/kb-get/handler.js');
    execute = handler.execute;
  });

  test('returns stable /kb-assets/ ref in markdown field', async () => {
    const mockContext = {
      args: {
        id: 'asset:andrei_clodius_photo_001',
      },
    };

    jest.mock('@/lib/services/vector-store-service', () => ({
      getByEntityId: jest.fn().mockResolvedValue([
        {
          id: 'asset:andrei_clodius_photo_001_chunk_0',
          text: 'Portrait photograph of Andrei Clodius',
          metadata: {
            entity_id: 'asset:andrei_clodius_photo_001',
            entity_type: 'photo',
            title: 'Andrei Clodius - LinkedIn Profile Photo',
            caption: 'Andrei Clodius - LinkedIn profile photo',
            blob_id: 'andrei-clodius/photo_of_andrei',
            file_extension: 'png',
            storage_provider: 'gcs',
          },
        },
      ]),
    }));

    const result = await execute(mockContext);

    expect(result.ok).toBe(true);
    expect(result.data.markdown).toBeDefined();
    expect(result.data.markdown).toContain('![');
    expect(result.data.markdown).toContain('/kb-assets/');
    // Should NOT contain signed GCS URL
    expect(result.data.markdown).not.toContain('https://storage.googleapis.com');
  });

  test('url field contains stable /kb-assets/ ref', async () => {
    const mockContext = {
      args: {
        id: 'asset:test_asset_001',
      },
    };

    jest.mock('@/lib/services/vector-store-service', () => ({
      getByEntityId: jest.fn().mockResolvedValue([
        {
          id: 'asset:test_asset_001_chunk_0',
          text: 'Test asset',
          metadata: {
            entity_id: 'asset:test_asset_001',
            entity_type: 'photo',
            title: 'Test Asset',
            caption: 'Test caption',
            blob_id: 'test/category-asset',
            file_extension: 'png',
            storage_provider: 'gcs',
          },
        },
      ]),
    }));

    const result = await execute(mockContext);

    expect(result.data.markdown).toContain('test/category-asset.png');
    expect(result.data.url).toBe('/kb-assets/test/category-asset.png');
  });

  test('includes blob_id in response', async () => {
    const mockContext = {
      args: {
        id: 'asset:test_asset_001',
      },
    };

    jest.mock('@/lib/services/vector-store-service', () => ({
      getByEntityId: jest.fn().mockResolvedValue([
        {
          id: 'asset:test_asset_001_chunk_0',
          text: 'Test asset',
          metadata: {
            entity_id: 'asset:test_asset_001',
            entity_type: 'photo',
            blob_id: 'test/blob-id',
            file_extension: 'png',
          },
        },
      ]),
    }));

    const result = await execute(mockContext);

    expect(result.data.blob_id).toBe('test/blob-id');
  });

  test('handles missing blob_id gracefully', async () => {
    const mockContext = {
      args: {
        id: 'asset:missing_blob_id',
      },
    };

    jest.mock('@/lib/services/vector-store-service', () => ({
      getByEntityId: jest.fn().mockResolvedValue([
        {
          id: 'asset:missing_blob_id_chunk_0',
          text: 'Test asset',
          metadata: {
            entity_id: 'asset:missing_blob_id',
            entity_type: 'photo',
            // Missing blob_id and file_extension
          },
        },
      ]),
    }));

    await expect(execute(mockContext)).rejects.toThrow();
  });

  test('preserves all other asset metadata', async () => {
    const mockContext = {
      args: {
        id: 'asset:test_asset_001',
      },
    };

    jest.mock('@/lib/services/vector-store-service', () => ({
      getByEntityId: jest.fn().mockResolvedValue([
        {
          id: 'asset:test_asset_001_chunk_0',
          text: 'Test description',
          metadata: {
            entity_id: 'asset:test_asset_001',
            entity_type: 'photo',
            title: 'Test Title',
            caption: 'Test Caption',
            blob_id: 'test/blob',
            file_extension: 'png',
            related_entities: JSON.stringify(['person:test']),
            tags: JSON.stringify(['test', 'photo']),
          },
        },
      ]),
    }));

    const result = await execute(mockContext);

    expect(result.data.title).toBe('Test Title');
    expect(result.data.caption).toBe('Test Caption');
    expect(result.data.description).toBe('Test description');
    expect(result.data.related_entities).toEqual(['person:test']);
    expect(result.data.tags).toEqual(['test', 'photo']);
  });

  test('_instructions field guides agent', async () => {
    const mockContext = {
      args: {
        id: 'asset:test_asset_001',
      },
    };

    jest.mock('@/lib/services/vector-store-service', () => ({
      getByEntityId: jest.fn().mockResolvedValue([
        {
          id: 'asset:test_asset_001_chunk_0',
          text: 'Test',
          metadata: {
            entity_id: 'asset:test_asset_001',
            entity_type: 'photo',
            blob_id: 'test/blob',
            file_extension: 'png',
          },
        },
      ]),
    }));

    const result = await execute(mockContext);

    expect(result.data._instructions).toBeDefined();
    expect(result.data._instructions).toContain('markdown');
  });
});
