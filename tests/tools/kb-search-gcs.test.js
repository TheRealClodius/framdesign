/**
 * Tests for kb_search tool with GCS assets
 *
 * These tests verify that kb_search emits stable /kb-assets/ references
 * (not signed GCS URLs) for asset results.
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';

// Mock the blob storage service — handler uses resolveBlobUrlSafe for dead asset detection
jest.mock('@/lib/services/blob-storage-service', () => ({
  resolveBlobUrlSafe: jest.fn((blobId, extension) => {
    return {
      url: `https://storage.googleapis.com/framdesign-assets/assets/${blobId}.${extension}`,
      exists: true,
    };
  }),
  fetchAssetBuffer: jest.fn(),
}));

describe('kb_search with GCS assets', () => {
  let execute;

  beforeEach(async () => {
    jest.resetModules();
    const handler = await import('../../tools/kb-search/handler.js');
    execute = handler.execute;
  });

  test('emits stable /kb-assets/ refs for assets', async () => {
    const mockContext = {
      args: {
        query: 'photos of Andrei',
        top_k: 5,
      },
      capabilities: { voice: false },
    };

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

    jest.mock('@/lib/services/embedding-service', () => ({
      generateQueryEmbedding: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    }));

    const result = await execute(mockContext);

    expect(result.ok).toBe(true);
    expect(result.data.results).toHaveLength(2);

    // Each asset result should have /kb-assets/ ref, NOT signed GCS URL
    result.data.results.forEach((assetResult) => {
      if (assetResult.type === 'photo' || assetResult.type === 'diagram') {
        expect(assetResult.metadata?.markdown).toBeDefined();
        expect(assetResult.metadata?.markdown).toContain('/kb-assets/');
        expect(assetResult.metadata?.markdown).not.toContain('https://storage.googleapis.com');
        expect(assetResult.metadata?.url).toMatch(/^\/kb-assets\//);
      }
    });
  });

  test('markdown field in search results contains stable ref', async () => {
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
    expect(result.data.results[0].metadata?.url).toBe('/kb-assets/semantic-space/canvas-sketch.png');
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

    // Asset entity SHOULD have markdown field with stable ref
    const assetResult = result.data.results.find(r => r.type === 'photo');
    expect(assetResult.metadata?.markdown).toBeDefined();
    expect(assetResult.metadata?.markdown).toContain('/kb-assets/');
  });

  test('filters by related_to parameter', async () => {
    const mockContext = {
      args: {
        query: 'interface screenshots',
        filters: { related_to: 'project:third_ear' },
        top_k: 5,
      },
      capabilities: { voice: false },
    };

    jest.mock('@/lib/services/vector-store-service', () => ({
      searchSimilar: jest.fn().mockResolvedValue([
        {
          text: 'Third Ear interface screenshot',
          score: 0.92,
          metadata: {
            entity_id: 'asset:third_ear_ui_001',
            entity_type: 'photo',
            title: 'Third Ear UI',
            related_entities: ['project:third_ear'],
            blob_id: 'third-ear/interface',
            file_extension: 'png',
          },
        },
      ]),
    }));

    jest.mock('@/lib/services/embedding-service', () => ({
      generateQueryEmbedding: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    }));

    const result = await execute(mockContext);

    expect(result.ok).toBe(true);
    expect(result.data.results).toHaveLength(1);
    expect(result.data.results[0].id).toBe('asset:third_ear_ui_001');
    expect(result.data.filters_applied).toEqual({ related_to: 'project:third_ear' });
  });

  test('combines type and related_to filters', async () => {
    const mockContext = {
      args: {
        query: 'demo',
        filters: { type: 'video', related_to: 'project:vector_watch' },
        top_k: 5,
      },
      capabilities: { voice: false },
    };

    jest.mock('@/lib/services/vector-store-service', () => ({
      searchSimilar: jest.fn().mockResolvedValue([
        {
          text: 'Vector Watch demo video',
          score: 0.88,
          metadata: {
            entity_id: 'asset:vector_watch_demo_001',
            entity_type: 'video',
            title: 'Vector Watch Demo',
            related_entities: ['project:vector_watch'],
            blob_id: 'vector/demo-video',
            file_extension: 'mp4',
          },
        },
      ]),
    }));

    jest.mock('@/lib/services/embedding-service', () => ({
      generateQueryEmbedding: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    }));

    const result = await execute(mockContext);

    expect(result.ok).toBe(true);
    expect(result.data.results).toHaveLength(1);
    expect(result.data.results[0].type).toBe('video');
    expect(result.data.filters_applied).toEqual({ type: 'video', related_to: 'project:vector_watch' });
  });
});
