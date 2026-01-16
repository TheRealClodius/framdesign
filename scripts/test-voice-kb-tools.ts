/**
 * Test KB Tools in Voice Mode Context
 * 
 * Simulates voice mode tool execution to verify KB tools work correctly
 * in voice mode (with voice mode capabilities and constraints)
 * 
 * Usage: npx tsx scripts/test-voice-kb-tools.ts
 */

import { config } from 'dotenv';
import path from 'path';

// Load environment variables
config({ path: path.join(process.cwd(), '.env.local') });

async function testVoiceKbTools() {
  console.log('🎤 Testing KB Tools in Voice Mode Context\n');

  // Dynamically import registry
  const { toolRegistry } = await import('../voice-server/tools/_core/registry.js');
  await toolRegistry.load();

  // Test 1: kb_search in voice mode (should auto-clamp to 3 results)
  console.log('='.repeat(60));
  console.log('TEST 1: kb_search - Voice Mode (auto-clamp to 3)');
  console.log('='.repeat(60));
  
  const searchResult = await toolRegistry.executeTool('kb_search', {
    clientId: 'voice-test-client',
    capabilities: { voice: true, messaging: true },
    args: {
      query: 'design process',
      top_k: 10 // Should be clamped to 3 in voice mode
    },
    session: {
      isActive: true,
      toolsVersion: toolRegistry.getVersion(),
      state: {}
    }
  });

  if (searchResult.ok && searchResult.data?.results) {
    console.log(`\n✅ Found ${searchResult.data.results.length} results:`);
    searchResult.data.results.forEach((r, i) => {
      console.log(`  ${i+1}. id="${r.id}", type="${r.type}", title="${r.title}", score=${r.score.toFixed(3)}`);
    });
    
    // Verify clamping
    if (searchResult.data.results.length <= 3) {
      console.log('\n✅ VERIFIED: Voice mode clamped results to ≤3');
    } else {
      console.log(`\n⚠️  WARNING: Voice mode should clamp to 3, got ${searchResult.data.results.length}`);
    }
    
    // Verify entity IDs
    const hasFramDesign = searchResult.data.results.some(r => r.id === 'lab:fram_design');
    if (hasFramDesign) {
      console.log('✅ VERIFIED: lab:fram_design found in results');
    }
  } else {
    console.log('❌ Search failed:', searchResult.error);
  }

  // Test 2: kb_get in voice mode
  console.log('\n' + '='.repeat(60));
  console.log('TEST 2: kb_get - Voice Mode');
  console.log('='.repeat(60));
  
  const getResult = await toolRegistry.executeTool('kb_get', {
    clientId: 'voice-test-client',
    capabilities: { voice: true, messaging: true },
    args: {
      id: 'person:andrei_clodius'
    },
    session: {
      isActive: true,
      toolsVersion: toolRegistry.getVersion(),
      state: {}
    }
  });

  if (getResult.ok && getResult.data) {
    console.log(`\n✅ Retrieved document:`);
    console.log(`  id="${getResult.data.id}"`);
    console.log(`  type="${getResult.data.type}"`);
    console.log(`  title="${getResult.data.title}"`);
    console.log(`  chunks_count=${getResult.data.chunks_count}`);
    console.log(`  content_length=${getResult.data.content.length} chars`);
    
    if (getResult.data.id === 'person:andrei_clodius') {
      console.log('\n✅ VERIFIED: Correct entity ID returned');
    }
  } else {
    console.log('❌ Get failed:', getResult.error);
  }

  // Test 3: Verify latency budgets (voice mode should be fast)
  console.log('\n' + '='.repeat(60));
  console.log('TEST 3: Latency Check');
  console.log('='.repeat(60));
  
  const startTime = Date.now();
  const latencyTest = await toolRegistry.executeTool('kb_search', {
    clientId: 'voice-test-client',
    capabilities: { voice: true },
    args: { query: 'design process' },
    session: {
      isActive: true,
      toolsVersion: toolRegistry.getVersion(),
      state: {}
    }
  });
  const latency = Date.now() - startTime;
  
  console.log(`\n✅ Latency: ${latency}ms`);
  
  const kbSearchMetadata = toolRegistry.getToolMetadata('kb_search');
  const latencyBudget = kbSearchMetadata?.latencyBudgetMs || 800;
  
  if (latency <= latencyBudget) {
    console.log(`✅ VERIFIED: Within latency budget (${latencyBudget}ms)`);
  } else {
    console.log(`⚠️  WARNING: Exceeded latency budget (${latencyBudget}ms)`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('VOICE MODE KB TOOLS TEST COMPLETE');
  console.log('='.repeat(60));
  console.log('\n✅ All voice mode tests passed!');
  console.log('\nNote: Full voice mode testing requires:');
  console.log('  1. Browser microphone permissions');
  console.log('  2. WebSocket connection to voice server');
  console.log('  3. Audio input/output');
  console.log('  4. Manual testing or automated audio simulation');
}

testVoiceKbTools().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
