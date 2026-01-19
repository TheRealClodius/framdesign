#!/usr/bin/env node
/**
 * Quick test script to verify Qdrant connection
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import { config } from 'dotenv';

// Load .env.local
config({ path: '.env.local' });

async function testQdrantConnection() {
  console.log('Testing Qdrant connection...\n');

  const endpoint = process.env.QDRANT_CLUSTER_ENDPOINT;
  const apiKey = process.env.QDRANT_API_KEY;

  if (!endpoint || !apiKey) {
    console.error('❌ Missing environment variables:');
    if (!endpoint) console.error('  - QDRANT_CLUSTER_ENDPOINT');
    if (!apiKey) console.error('  - QDRANT_API_KEY');
    console.error('\nMake sure they are set in .env.local file');
    process.exit(1);
  }

  console.log(`Cluster Endpoint: ${endpoint}`);
  console.log(`API Key: ${apiKey.substring(0, 8)}...${apiKey.substring(apiKey.length - 4)}\n`);

  try {
    const client = new QdrantClient({
      url: endpoint,
      apiKey: apiKey,
    });

    // Test 1: List collections
    console.log('Test 1: Listing collections...');
    const collections = await client.getCollections();
    console.log(`✅ Found ${collections.collections.length} collection(s):`);
    collections.collections.forEach((col) => {
      console.log(`  - ${col.name}`);
    });

    // Test 2: Check kb_documents collection
    const kbCollection = collections.collections.find((col) => col.name === 'kb_documents');
    if (kbCollection) {
      console.log('\nTest 2: Checking kb_documents collection...');
      const collectionInfo = await client.getCollection('kb_documents');
      console.log(`✅ Collection exists with ${collectionInfo.points_count || 0} points`);
      console.log(`  Vector size: ${collectionInfo.config?.params?.vectors?.size || 'N/A'}`);
      console.log(`  Distance: ${collectionInfo.config?.params?.vectors?.distance || 'N/A'}`);
    } else {
      console.log('\n⚠️  kb_documents collection does not exist yet');
      console.log('   Run the embedding script to create it:');
      console.log('   npm run embed:kb');
    }

    console.log('\n✅ Qdrant connection successful!\n');
  } catch (error) {
    console.error('\n❌ Qdrant connection failed:');
    console.error(`   ${error.message}\n`);
    if (error.data) {
      console.error('Error details:', JSON.stringify(error.data, null, 2));
    }
    process.exit(1);
  }
}

testQdrantConnection();
