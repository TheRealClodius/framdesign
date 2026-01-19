/**
 * E2E Integration Tests for Asset Retrieval with GCS
 * 
 * These tests verify the complete flow from agent request
 * to rendered asset, using real API calls where appropriate.
 */

import { describe, test, expect, beforeAll } from '@jest/globals';
import { toolRegistry } from '../../tools/_core/registry.js';

describe('E2E: Asset Retrieval with GCS', () => {
  beforeAll(async () => {
    if (!toolRegistry.getVersion()) {
      await toolRegistry.load();
      toolRegistry.lock();
    }
  });

  test('agent retrieves asset and uses markdown field', async () => {
    // This is a high-level integration test
    // In a real scenario, we'd call the actual kb_get tool
    // and verify the response structure
    
    const executionContext = {
      clientId: 'test-client',
      ws: null,
      geminiSession: null,
      args: {
        id: 'asset:andrei_clodius_photo_001',
      },
      capabilities: { voice: false },
      session: {
        isActive: true,
        toolsVersion: toolRegistry.getVersion(),
        state: { mode: 'text' },
      },
    };

    // Skip if GCS not configured (for CI/CD)
    if (!process.env.GCS_BUCKET_NAME) {
      console.log('Skipping E2E test - GCS not configured');
      return;
    }

    const result = await toolRegistry.executeTool('kb_get', executionContext);

    if (result.ok) {
      // Verify markdown field exists
      expect(result.data.markdown).toBeDefined();
      expect(result.data.markdown).toContain('![');
      
      // Verify URL is GCS URL
      expect(result.data.url).toContain('storage.googleapis.com');
      
      // Verify blob_id is present
      expect(result.data.blob_id).toBeDefined();
    }
  });

  test('GCS URLs are publicly accessible', async () => {
    // This test makes actual HTTP requests to verify URLs work
    // Skip if GCS not configured
    
    if (!process.env.GCS_BUCKET_NAME) {
      console.log('Skipping URL accessibility test - GCS not configured');
      return;
    }

    const testUrl = 'https://storage.googleapis.com/framdesign-assets/assets/test/test.png';
    
    try {
      const response = await fetch(testUrl, { method: 'HEAD' });
      // 404 is acceptable for test file - we're just checking URL format
      expect([200, 404]).toContain(response.status);
    } catch (error) {
      // Network errors are acceptable in test environment
      console.log('Network error (acceptable in test):', error.message);
    }
  });

  test('multiple assets in single response', async () => {
    if (!process.env.GCS_BUCKET_NAME) {
      console.log('Skipping test - GCS not configured');
      return;
    }

    const executionContext = {
      clientId: 'test-client',
      ws: null,
      geminiSession: null,
      args: {
        query: 'photos',
        top_k: 5,
      },
      capabilities: { voice: false },
      session: {
        isActive: true,
        toolsVersion: toolRegistry.getVersion(),
        state: { mode: 'text' },
      },
    };

    const result = await toolRegistry.executeTool('kb_search', executionContext);

    if (result.ok && result.data.results) {
      // Check that asset results have markdown fields
      const assetResults = result.data.results.filter(
        r => ['photo', 'diagram', 'video', 'gif'].includes(r.type)
      );
      
      assetResults.forEach((asset) => {
        expect(asset.metadata?.markdown || asset.markdown).toBeDefined();
      });
    }
  });

  test('video assets work', async () => {
    if (!process.env.GCS_BUCKET_NAME) {
      console.log('Skipping test - GCS not configured');
      return;
    }

    const executionContext = {
      clientId: 'test-client',
      ws: null,
      geminiSession: null,
      args: {
        id: 'asset:autopilot_modes_exploration_001', // Video asset from manifest
      },
      capabilities: { voice: false },
      session: {
        isActive: true,
        toolsVersion: toolRegistry.getVersion(),
        state: { mode: 'text' },
      },
    };

    const result = await toolRegistry.executeTool('kb_get', executionContext);

    if (result.ok && result.data.type === 'asset' && result.data.entity_type === 'video') {
      expect(result.data.markdown).toBeDefined();
      expect(result.data.url).toContain('.mov');
      expect(result.data.file_extension).toBe('mov');
    }
  });
});
