/**
 * End-to-End Retrieval Test
 * 
 * Tests actual asset retrieval to verify:
 * 1. Tool handlers work correctly
 * 2. Blob URL resolution works
 * 3. Markdown generation is correct
 * 4. Fallback logic works when blob_id missing
 */

import dotenv from 'dotenv';
import { toolRegistry } from '../tools/_core/registry.js';

dotenv.config({ path: '.env' });

async function testRetrieval() {
  console.log('🧪 Testing Asset Retrieval End-to-End\n');
  console.log('='.repeat(60));
  
  // Load tool registry
  if (!toolRegistry.getVersion()) {
    await toolRegistry.load();
    toolRegistry.lock();
  }
  
  const executionContext = {
    clientId: 'test-retrieval',
    ws: null,
    geminiSession: null,
    capabilities: { voice: false },
    session: {
      isActive: true,
      toolsVersion: toolRegistry.getVersion(),
      state: { mode: 'text' },
    },
  };
  
  // Test 1: Try to retrieve an asset
  console.log('\n1. Testing kb_get with asset...');
  try {
    const result = await toolRegistry.executeTool('kb_get', {
      ...executionContext,
      args: { id: 'asset:andrei_clodius_photo_001' },
    });
    
    if (result.ok) {
      console.log('  ✓ kb_get executed successfully');
      console.log(`  Type: ${result.data.type}`);
      console.log(`  Entity Type: ${result.data.entity_type}`);
      
      // Check for new GCS fields
      if (result.data.blob_id) {
        console.log(`  ✓ Has blob_id: ${result.data.blob_id}`);
      } else {
        console.log('  ⚠️  No blob_id (asset not migrated yet)');
      }
      
      if (result.data.url) {
        console.log(`  ✓ Has URL: ${result.data.url.substring(0, 70)}...`);
        if (result.data.url.includes('storage.googleapis.com')) {
          console.log('  ✓ URL is GCS URL');
        } else {
          console.log('  ⚠️  URL is local path (fallback)');
        }
      }
      
      if (result.data.markdown) {
        console.log(`  ✓ Has markdown: ${result.data.markdown.substring(0, 70)}...`);
        if (result.data.markdown.includes('storage.googleapis.com')) {
          console.log('  ✓ Markdown contains GCS URL');
        }
      } else {
        console.log('  ⚠️  No markdown field');
      }
      
      if (result.data._instructions) {
        console.log(`  ✓ Has _instructions: ${result.data._instructions.substring(0, 50)}...`);
      }
    } else {
      console.log(`  ✗ kb_get failed: ${result.error.message}`);
      if (result.error.message.includes('not found')) {
        console.log('  → Asset not in Qdrant (run embed-kb after migration)');
      }
    }
  } catch (error) {
    console.error(`  ✗ Error: ${error.message}`);
  }
  
  // Test 2: Test kb_search
  console.log('\n2. Testing kb_search for assets...');
  try {
    const result = await toolRegistry.executeTool('kb_search', {
      ...executionContext,
      args: { query: 'photos of Andrei', top_k: 3 },
    });
    
    if (result.ok) {
      console.log(`  ✓ kb_search executed successfully`);
      console.log(`  Results: ${result.data.results.length}`);
      
      const assetResults = result.data.results.filter(
        r => ['photo', 'diagram', 'video', 'gif'].includes(r.type)
      );
      
      if (assetResults.length > 0) {
        console.log(`  Asset results: ${assetResults.length}`);
        assetResults.forEach((asset, i) => {
          console.log(`  Asset ${i + 1}:`);
          console.log(`    ID: ${asset.id}`);
          console.log(`    Type: ${asset.type}`);
          if (asset.metadata?.markdown) {
            console.log(`    ✓ Has markdown`);
          } else if (asset.markdown) {
            console.log(`    ✓ Has markdown (top level)`);
          } else {
            console.log(`    ⚠️  No markdown field`);
          }
        });
      } else {
        console.log('  → No asset results found (may be text documents)');
      }
    } else {
      console.log(`  ✗ kb_search failed: ${result.error.message}`);
    }
  } catch (error) {
    console.error(`  ✗ Error: ${error.message}`);
  }
  
  // Test 3: Verify blob storage service works
  console.log('\n3. Testing blob storage service directly...');
  try {
    const blobService = await import('../lib/services/blob-storage-service.js');
    const { resolveBlobUrl } = blobService;
    
    process.env.GCS_BUCKET_NAME = process.env.GCS_BUCKET_NAME || 'framdesign-assets';
    
    const testUrl = resolveBlobUrl('test/category', 'png');
    console.log(`  ✓ resolveBlobUrl works: ${testUrl.substring(0, 70)}...`);
    
    if (testUrl.includes('storage.googleapis.com')) {
      console.log('  ✓ URL format is correct');
    } else {
      console.log('  ✗ URL format is incorrect');
    }
  } catch (error) {
    console.error(`  ✗ Blob service error: ${error.message}`);
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('✅ Retrieval tests completed!');
  console.log('\nNext steps:');
  console.log('  1. Set up GCS (if not done): See docs/GCS_MIGRATION_STATUS.md');
  console.log('  2. Transform manifest: node scripts/transform-manifest-to-gcs.js');
  console.log('  3. Migrate assets: node scripts/migrate-assets-to-gcs.js');
  console.log('  4. Update Qdrant: npm run embed-kb');
  console.log('  5. Test with agent queries');
}

testRetrieval().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
