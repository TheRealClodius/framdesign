/**
 * Simple test to verify asset is searchable in Qdrant
 */

import { config } from 'dotenv';
import path from 'path';
config({ path: path.join(process.cwd(), '.env.local'), override: true });

// Direct Qdrant test
async function testAssetInQdrant() {
  console.log('🧪 Testing Asset in Qdrant\n');

  try {
    // Import vector store service directly
    const { searchSimilar } = await import('../lib/services/vector-store-service.ts');
    const { generateQueryEmbedding } = await import('../lib/services/embedding-service.ts');

    // Test 1: Search for Vector Watch images
    console.log('🔍 Test 1: Searching for "Vector Watch hardware photos"...');
    const queryEmbedding = await generateQueryEmbedding('Vector Watch hardware photos');
    const results = await searchSimilar(queryEmbedding, 5);

    console.log(`✅ Found ${results.length} results\n`);

    // Find asset results
    const assetResults = results.filter(r => r.metadata?.entity_type === 'photo');
    
    if (assetResults.length > 0) {
      console.log('📸 Asset found!');
      const asset = assetResults[0];
      console.log(`   ID: ${asset.metadata.entity_id}`);
      console.log(`   Title: ${asset.metadata.title}`);
      console.log(`   Path: ${asset.metadata.path}`);
      console.log(`   Score: ${asset.score}`);
      console.log(`   Caption: ${asset.metadata.caption}`);
      console.log(`   Tags: ${asset.metadata.tags}`);
      
      console.log('\n📝 Markdown output:');
      console.log(`   ![${asset.metadata.caption}](${asset.metadata.path})`);
      
      console.log('\n✅ Asset retrieval works! Image should display in chat.');
    } else {
      console.log('⚠️  No asset found in results');
      console.log('All results:');
      results.forEach((r, i) => {
        console.log(`   ${i + 1}. ${r.metadata?.title} (type: ${r.metadata?.entity_type}, score: ${r.score})`);
      });
    }

    // Test 2: Direct retrieval by entity_id
    console.log('\n🔍 Test 2: Direct retrieval by entity_id filter...');
    const assetQuery = await generateQueryEmbedding('document');
    const assetResults2 = await searchSimilar(
      assetQuery,
      10,
      { entity_id: 'asset:vector_watch_luna_001' }
    );

    if (assetResults2.length > 0) {
      console.log('✅ Direct retrieval works!');
      console.log(`   Found ${assetResults2.length} chunks for asset:vector_watch_luna_001`);
    } else {
      console.log('❌ Asset not found with entity_id filter');
    }

    console.log('\n🎉 Tests complete!');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

testAssetInQdrant();
