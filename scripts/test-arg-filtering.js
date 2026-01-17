#!/usr/bin/env node
/**
 * Quick test script to verify argument filtering works correctly
 * Tests the fix for chained tool calls with extra properties
 * 
 * Usage: node scripts/test-arg-filtering.js
 */

import { toolRegistry } from '../tools/_core/registry.js';

async function testArgFiltering() {
  console.log('🧪 Testing Argument Filtering Fix\n');
  console.log('='.repeat(60));

  try {
    // Load registry
    console.log('📚 Loading tool registry...');
    await toolRegistry.load();
    toolRegistry.lock();
    console.log('✅ Registry loaded\n');

    // Test 1: Extra top-level properties
    console.log('TEST 1: Filtering extra top-level properties');
    console.log('-'.repeat(60));
    const result1 = await toolRegistry.executeTool('kb_search', {
      clientId: 'test-filter-1',
      args: {
        query: 'test query',
        top_k: 5,
        // These should be filtered out
        extra_property: 'should be removed',
        another_extra: 123,
        _internal_prop: 'also removed'
      },
      session: { isActive: true },
      capabilities: { voice: false }
    });

    if (result1.ok) {
      console.log('✅ PASS: Tool executed successfully with extra properties');
      console.log(`   Query: ${result1.data.query}`);
      console.log(`   Top K: ${result1.data.top_k || 'default'}`);
    } else {
      console.log('❌ FAIL: Tool execution failed');
      console.log(`   Error: ${result1.error.message}`);
      process.exit(1);
    }

    console.log('\n');

    // Test 2: Extra nested properties
    console.log('TEST 2: Filtering extra nested properties');
    console.log('-'.repeat(60));
    const result2 = await toolRegistry.executeTool('kb_search', {
      clientId: 'test-filter-2',
      args: {
        query: 'test',
        filters: {
          type: 'person',
          // These should be filtered out
          extra_nested: 'removed',
          _internal_nested: 'also removed'
        },
        extra_top_level: 'removed'
      },
      session: { isActive: true },
      capabilities: { voice: false }
    });

    if (result2.ok) {
      console.log('✅ PASS: Tool executed successfully with extra nested properties');
      console.log(`   Query: ${result2.data.query}`);
      if (result2.data.filters_applied) {
        console.log(`   Filters: ${JSON.stringify(result2.data.filters_applied)}`);
      }
    } else {
      console.log('❌ FAIL: Tool execution failed');
      console.log(`   Error: ${result2.error.message}`);
      process.exit(1);
    }

    console.log('\n');

    // Test 3: Simulate chained call scenario (like Gemini would return)
    console.log('TEST 3: Simulating chained call with extra properties');
    console.log('-'.repeat(60));
    const chainedArgs = {
      query: 'projects by Andrei Clodius Fram Design',
      top_k: 3,
      // Simulate what Gemini might add in a chained call
      _previous_result: { id: 'some_id' },
      _chain_position: 1,
      _thought_signature: 'abc123'
    };

    const result3 = await toolRegistry.executeTool('kb_search', {
      clientId: 'test-filter-3',
      args: chainedArgs,
      session: { isActive: true },
      capabilities: { voice: false }
    });

    if (result3.ok) {
      console.log('✅ PASS: Chained call scenario handled correctly');
      console.log(`   Query: ${result3.data.query}`);
      console.log(`   Results found: ${result3.data.total_found || 0}`);
    } else {
      console.log('❌ FAIL: Chained call scenario failed');
      console.log(`   Error: ${result3.error.message}`);
      if (result3.error.details) {
        console.log(`   Details: ${JSON.stringify(result3.error.details, null, 2)}`);
      }
      process.exit(1);
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ All tests passed! Argument filtering is working correctly.');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n❌ Test failed with error:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

testArgFiltering();
