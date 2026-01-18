/**
 * Test script for asset retrieval
 * Verifies that kb_search and kb_get work with assets
 */

import { config } from 'dotenv';
import path from 'path';
config({ path: path.join(process.cwd(), '.env.local'), override: true });

import { toolRegistry } from '../tools/_core/registry.js';

async function testAssetRetrieval() {
  console.log('🧪 Testing Asset Retrieval\n');

  try {
    // Load tool registry
    console.log('📦 Loading tool registry...');
    await toolRegistry.load();
    console.log('✅ Tool registry loaded\n');

    // Test 1: Search for Vector Watch assets
    console.log('🔍 Test 1: Searching for "vector watch hardware"...');
    const searchResult = await toolRegistry.executeTool('kb_search', {
      args: {
        query: 'vector watch hardware photos',
        top_k: 5
      }
    });

    if (searchResult.ok) {
      console.log(`✅ Search successful! Found ${searchResult.data.results.length} results`);
      
      // Find asset results
      const assetResults = searchResult.data.results.filter(r => r.type === 'asset');
      console.log(`   Assets found: ${assetResults.length}`);
      
      if (assetResults.length > 0) {
        console.log('\n📋 Asset search results:');
        assetResults.forEach((result, i) => {
          console.log(`   ${i + 1}. ${result.title} (${result.id})`);
          console.log(`      Score: ${result.score}`);
          console.log(`      Snippet: ${result.snippet?.substring(0, 80)}...`);
        });
      } else {
        console.log('   ⚠️  No assets found in search results');
        console.log('   All results:');
        searchResult.data.results.forEach((result, i) => {
          console.log(`   ${i + 1}. ${result.title} (type: ${result.type})`);
        });
      }
    } else {
      console.log('❌ Search failed:', searchResult.error);
      return;
    }

    // Test 2: Get specific asset by ID
    console.log('\n🔍 Test 2: Retrieving asset by ID...');
    const getResult = await toolRegistry.executeTool('kb_get', {
      args: {
        id: 'asset:vector_watch_luna_001'
      }
    });

    if (getResult.ok) {
      console.log('✅ Asset retrieved successfully!');
      console.log('\n📄 Asset details:');
      console.log(`   ID: ${getResult.data.id}`);
      console.log(`   Type: ${getResult.data.type}`);
      console.log(`   Entity Type: ${getResult.data.entity_type}`);
      console.log(`   Title: ${getResult.data.title}`);
      console.log(`   Path: ${getResult.data.path}`);
      console.log(`   Caption: ${getResult.data.caption}`);
      console.log(`   Related entities: ${JSON.stringify(getResult.data.related_entities)}`);
      console.log(`   Tags: ${JSON.stringify(getResult.data.tags)}`);
      
      // Test 3: Format as markdown
      console.log('\n📝 Test 3: Formatting as markdown...');
      const markdown = `![${getResult.data.caption}](${getResult.data.path})`;
      console.log('   Markdown output:');
      console.log(`   ${markdown}`);
      console.log('\n   ✅ Markdown formatted successfully!');
    } else {
      console.log('❌ Asset retrieval failed:', getResult.error);
      return;
    }

    console.log('\n🎉 All tests passed!');
    
  } catch (error) {
    console.error('\n❌ Test failed with error:', error);
    process.exit(1);
  }
}

testAssetRetrieval();
