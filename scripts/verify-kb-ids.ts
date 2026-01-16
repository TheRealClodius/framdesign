/**
 * Verify KB Tool IDs
 * 
 * Tests the exact queries used in browser to verify correct entity IDs are returned
 */

import { config } from 'dotenv';
import path from 'path';

// Load environment variables
config({ path: path.join(process.cwd(), '.env.local') });

async function verifyIds() {
  console.log('🔍 Verifying KB Tool IDs\n');

  // Dynamically import registry
  const { toolRegistry } = await import('../tools/_core/registry.js');
  await toolRegistry.load();

  // Test 1: kb_search for "design process"
  console.log('='.repeat(60));
  console.log('TEST 1: kb_search - "design process"');
  console.log('='.repeat(60));
  
  const searchResult = await toolRegistry.executeTool('kb_search', {
    clientId: 'verify-test',
    capabilities: { voice: false },
    args: { query: 'design process' }
  });

  if (searchResult.ok && searchResult.data?.results) {
    console.log(`\n✅ Found ${searchResult.data.results.length} results:`);
    searchResult.data.results.forEach((r, i) => {
      console.log(`  ${i+1}. id="${r.id}", type="${r.type}", title="${r.title}"`);
    });
    
    // Check if lab:fram_design is in results
    const hasFramDesign = searchResult.data.results.some(r => r.id === 'lab:fram_design');
    if (hasFramDesign) {
      console.log('\n✅ VERIFIED: lab:fram_design found in results');
    } else {
      console.log('\n⚠️  WARNING: lab:fram_design not found in results');
    }
  } else {
    console.log('❌ Search failed:', searchResult.error);
  }

  // Test 2: kb_get for "person:andrei_clodius"
  console.log('\n' + '='.repeat(60));
  console.log('TEST 2: kb_get - "person:andrei_clodius"');
  console.log('='.repeat(60));
  
  const getResult = await toolRegistry.executeTool('kb_get', {
    clientId: 'verify-test',
    capabilities: { voice: false },
    args: { id: 'person:andrei_clodius' }
  });

  if (getResult.ok && getResult.data) {
    console.log(`\n✅ Retrieved document:`);
    console.log(`  id="${getResult.data.id}"`);
    console.log(`  type="${getResult.data.type}"`);
    console.log(`  title="${getResult.data.title}"`);
    console.log(`  chunks_count=${getResult.data.chunks_count}`);
    
    if (getResult.data.id === 'person:andrei_clodius') {
      console.log('\n✅ VERIFIED: Correct entity ID returned');
    } else {
      console.log(`\n❌ FAILED: Expected "person:andrei_clodius", got "${getResult.data.id}"`);
    }
  } else {
    console.log('❌ Get failed:', getResult.error);
  }

  console.log('\n' + '='.repeat(60));
  console.log('VERIFICATION COMPLETE');
  console.log('='.repeat(60));
}

verifyIds().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
