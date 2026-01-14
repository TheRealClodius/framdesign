import { config } from 'dotenv';
import path from 'path';
config({ path: path.join(process.cwd(), '.env.local') });

async function verify() {
  const { toolRegistry } = await import('../tools/_core/registry.js');
  await toolRegistry.load();

  console.log('✅ Tool Registry Loaded\n');

  // Test kb_search
  console.log('Testing kb_search...');
  const searchResult = await toolRegistry.executeTool('kb_search', {
    clientId: 'test',
    capabilities: { voice: false },
    args: { query: 'Who is Andrei?', top_k: 3 }
  });

  console.log('  Status:', searchResult.ok ? '✅ SUCCESS' : '❌ FAILED');
  console.log('  Results:', searchResult.data?.results?.length || 0);

  if (searchResult.ok && searchResult.data.results[0]) {
    const entityId = searchResult.data.results[0].id;
    console.log('\nTesting kb_get with ID:', entityId);

    const getResult = await toolRegistry.executeTool('kb_get', {
      clientId: 'test',
      capabilities: { voice: false },
      args: { id: entityId }
    });

    console.log('  Status:', getResult.ok ? '✅ SUCCESS' : '❌ FAILED');
    if (getResult.ok) {
      console.log('  Content length:', getResult.data.content.length, 'chars');
      console.log('  Chunks retrieved:', getResult.data.chunks_count);
      console.log('  Title:', getResult.data.title);
    } else {
      console.log('  Error:', getResult.error?.message);
    }
  }

  console.log('\n✅ Verification complete!');
}

verify().catch(console.error);
