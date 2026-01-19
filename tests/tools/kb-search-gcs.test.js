/**
 * Tests for kb_search tool with GCS assets
 * 
 * These tests verify that kb_search correctly resolves blob_ids
 * for asset results and includes markdown fields.
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';

// Mock the blob storage service
jest.mock('@/lib/services/blob-storage-service', () => ({
  resolveBlobUrl: jest.fn((blobId, extension) => {
    return `https://storage.googleapis.com/framdesign-assets/assets/${blobId}.${extension}`;
  }),
}));

describe('kb_search with GCS assets', () => {
  let execute;

  beforeEach(async () => {
    jest.resetModules();
    const handler = await import('../../tools/kb-search/handler.js');
    execute = handler.execute;
  });

  test('resolves multiple assets URLs', async () => {
    const mockContext = {
      args: {
        query: 'photos of Andrei',
        top_k: 5,
      },
      capabilities: { voice: false },
    };

    // Mock searchSimilar to return multiple assets
    jest.mock('@/lib/services/vector-store-service', () => ({
      searchSimilar: jest.fn().mockResolvedValue([
        {
          text: 'Portrait photo',
          score: 0.95,
          metadata: {
            entity_id: 'asset:andrei_photo_001',
            entity_type: 'photo',
            title: 'Andrei Photo',
            blob_id: 'andrei-clodius/photo_of_andrei',
            file_extension: 'png',
          },
        },
        {
          text: 'Design values diagram',
          score: 0.90,
          metadata: {
            entity_id: 'asset:andrei_design_values_001',
            entity_type: 'diagram',
            title: 'Design Values',
            blob_id: 'andrei-clodius/design-values',
            file_extension: 'png',
          },
        },
      ]),
    }));

    // Mock generateQueryEmbedding
    jest.mock('@/lib/services/embedding-service', () => ({
      generateQueryEmbedding: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    }));

    const result = await execute(mockContext);

    expect(result.ok).toBe(true);
    expect(result.data.results).toHaveLength(2);
    
    // Each asset result should have markdown field
    result.data.results.forEach((assetResult) => {
      if (assetResult.type === 'photo' || assetResult.type === 'diagram') {
        expect(assetResult.metadata?.markdown).toBeDefined();
        expect(assetResult.metadata?.markdown).toContain('https://storage.googleapis.com');
      }
    });
  });

  test('markdown field in search results', async () => {
    const mockContext = {
      args: {
        query: 'canvas sketch',
        top_k: 3,
      },
      capabilities: { voice: false },
    };

    jest.mock('@/lib/services/vector-store-service', () => ({
      searchSimilar: jest.fn().mockResolvedValue([
        {
          text: 'Canvas design sketch',
          score: 0.92,
          metadata: {
            entity_id: 'asset:semantic_space_canvas_001',
            entity_type: 'diagram',
            title: 'Semantic Space Canvas',
            caption: 'Canvas view design sketch',
            blob_id: 'semantic-space/canvas-sketch',
            file_extension: 'png',
          },
        },
      ]),
    }));

    jest.mock('@/lib/services/embedding-service', () => ({
      generateQueryEmbedding: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    }));

    const result = await execute(mockContext);

    expect(result.data.results[0].metadata?.markdown).toBeDefined();
    expect(result.data.results[0].metadata?.markdown).toContain('semantic-space/canvas-sketch.png');
  });

  test('mixed results (text + assets)', async () => {
    const mockContext = {
      args: {
        query: 'Andrei Clodius',
        top_k: 5,
      },
      capabilities: { voice: false },
    };

    jest.mock('@/lib/services/vector-store-service', () => ({
      searchSimilar: jest.fn().mockResolvedValue([
        {
          text: 'Andrei Clodius is a designer...',
          score: 0.95,
          metadata: {
            entity_id: 'person:andrei_clodius',
            entity_type: 'person',
            title: 'Andrei Clodius',
            // No blob_id - this is a text document
          },
        },
        {
          text: 'Portrait photo',
          score: 0.90,
          metadata: {
            entity_id: 'asset:andrei_photo_001',
            entity_type: 'photo',
            title: 'Andrei Photo',
            blob_id: 'andrei-clodius/photo_of_andrei',
            file_extension: 'png',
          },
        },
      ]),
    }));

    jest.mock('@/lib/services/embedding-service', () => ({
      generateQueryEmbedding: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    }));

    const result = await execute(mockContext);

    expect(result.data.results).toHaveLength(2);
    
    // Text entity should NOT have markdown field
    const textResult = result.data.results.find(r => r.type === 'person');
    expect(textResult.metadata?.markdown).toBeUndefined();
    
    // Asset entity SHOULD have markdown field
    const assetResult = result.data.results.find(r => r.type === 'photo');
    expect(assetResult.metadata?.markdown).toBeDefined();
  });
});
