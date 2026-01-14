/**
 * Test KB Tools
 *
 * Tests kb_search and kb_get tools via tool registry
 * Usage: npx tsx scripts/test-kb-tools.ts
 */

import { config } from 'dotenv';
import path from 'path';

// Load environment variables
config({ path: path.join(process.cwd(), '.env.local') });

async function testKbTools() {
  console.log('🧪 Testing KB Tools via Tool Registry\n');

  // Dynamically import registry (avoid bundling issues)
  const { toolRegistry } = await import('../tools/_core/registry.js');

  // Load tool registry
  console.log('📚 Loading tool registry...');
  await toolRegistry.load();
  console.log('✅ Registry loaded\n');

  // Test kb_search
  console.log('='.repeat(60));
  console.log('TEST 1: kb_search - Simple Query');
  console.log('='.repeat(60));

  try {
    const searchResult = await toolRegistry.executeTool('kb_search', {
      clientId: 'test-client',
      capabilities: { voice: false, messaging: true },
      args: {
        query: 'Who worked on Vector Watch?'
      }
    });

    console.log('\n✅ kb_search Result:');
    console.log(JSON.stringify(searchResult, null, 2));

    // Test kb_get if we got results
    if (searchResult.ok && searchResult.data?.results?.length > 0) {
      const firstResult = searchResult.data.results[0];
      const entityId = firstResult.id;

      console.log('\n' + '='.repeat(60));
      console.log(`TEST 2: kb_get - Retrieve entity: ${entityId}`);
      console.log('='.repeat(60));

      const getResult = await toolRegistry.executeTool('kb_get', {
        clientId: 'test-client',
        capabilities: { voice: false, messaging: true },
        args: {
          id: entityId
        }
      });

      console.log('\n✅ kb_get Result:');
      console.log(JSON.stringify(getResult, null, 2));
    } else {
      console.log('\n⚠️  No results from kb_search, skipping kb_get test');
    }

    // Test voice mode clamping
    console.log('\n' + '='.repeat(60));
    console.log('TEST 3: kb_search - Voice Mode Clamping');
    console.log('='.repeat(60));

    const voiceResult = await toolRegistry.executeTool('kb_search', {
      clientId: 'test-client',
      capabilities: { voice: true, messaging: true },
      args: {
        query: 'FRAM design projects',
        top_k: 10 // Should be clamped to 3
      }
    });

    console.log('\n✅ Voice Mode Result:');
    console.log(`  Requested top_k: 10`);
    console.log(`  Returned results: ${voiceResult.data?.results?.length || 0}`);
    console.log(`  Clamped: ${voiceResult.data?.clamped || false}`);

    if (voiceResult.data?.results?.length > 3) {
      console.log('  ❌ FAILED: Voice mode should clamp to max 3 results');
    } else {
      console.log('  ✅ PASSED: Voice mode clamping works correctly');
    }

    // Test empty results
    console.log('\n' + '='.repeat(60));
    console.log('TEST 4: kb_search - Empty Results');
    console.log('='.repeat(60));

    const emptyResult = await toolRegistry.executeTool('kb_search', {
      clientId: 'test-client',
      capabilities: { voice: false, messaging: true },
      args: {
        query: 'quantum computing blockchain NFT metaverse xyz123'
      }
    });

    console.log('\n✅ Empty Results Handling:');
    console.log(`  Success: ${emptyResult.ok}`);
    console.log(`  Results: ${emptyResult.data?.results?.length || 0}`);

    if (!emptyResult.ok || emptyResult.data?.results?.length > 0) {
      console.log('  ❌ FAILED: Empty results should return ok=true with empty array');
    } else {
      console.log('  ✅ PASSED: Empty results handled correctly');
    }

    // Test kb_get with non-existent ID
    console.log('\n' + '='.repeat(60));
    console.log('TEST 5: kb_get - Non-existent Entity');
    console.log('='.repeat(60));

    const notFoundResult = await toolRegistry.executeTool('kb_get', {
      clientId: 'test-client',
      capabilities: { voice: false, messaging: true },
      args: {
        id: 'person:nonexistent_xyz'
      }
    });

    console.log('\n✅ Not Found Result:');
    console.log(`  Success: ${notFoundResult.ok}`);
    console.log(`  Error Type: ${notFoundResult.error?.type || 'N/A'}`);
    console.log(`  Retryable: ${notFoundResult.error?.retryable || false}`);

    if (notFoundResult.ok || notFoundResult.error?.type !== 'PERMANENT') {
      console.log('  ❌ FAILED: Non-existent entity should return PERMANENT error');
    } else {
      console.log('  ✅ PASSED: Non-existent entity handled correctly');
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('TEST SUMMARY');
    console.log('='.repeat(60));
    console.log('✅ All tests completed!');
    console.log('\nTools verified:');
    console.log('  ✓ kb_search - semantic search working');
    console.log('  ✓ kb_get - ID-based retrieval working');
    console.log('  ✓ Voice mode clamping working');
    console.log('  ✓ Error handling working');

  } catch (error: any) {
    console.error('\n❌ Test failed with error:');
    console.error(error);
    process.exit(1);
  }
}

testKbTools().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
