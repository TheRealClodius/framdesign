/**
 * Test script to verify Perplexity API key works
 * Run with: node scripts/test-perplexity-api.js
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env file
dotenv.config({ path: join(__dirname, '..', '.env') });

const apiKey = process.env.PERPLEXITY_API_KEY?.trim();

console.log('=== Perplexity API Key Test ===\n');
console.log('API Key present:', !!apiKey);
console.log('API Key length:', apiKey?.length || 0);
console.log('API Key starts with:', apiKey?.substring(0, 8) || 'N/A');
console.log('API Key ends with:', apiKey?.substring(Math.max(0, (apiKey?.length || 0) - 4)) || 'N/A');
console.log('');

if (!apiKey) {
  console.error('❌ PERPLEXITY_API_KEY not found in environment variables');
  console.log('Make sure PERPLEXITY_API_KEY is set in your .env file');
  process.exit(1);
}

if (!apiKey.startsWith('pplx-')) {
  console.warn('⚠️  Warning: API key does not start with "pplx-". This may indicate an invalid key format.');
}

console.log('Testing API call...\n');

try {
  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'sonar',
      messages: [
        {
          role: 'user',
          content: 'What is 2+2?'
        }
      ],
      temperature: 0.2,
      max_tokens: 100
    })
  });

  console.log('Response status:', response.status, response.statusText);
  console.log('Response headers:', Object.fromEntries(response.headers.entries()));
  console.log('');

  const responseText = await response.text();
  console.log('Response body (first 500 chars):', responseText.substring(0, 500));
  console.log('');

  if (response.ok) {
    const data = JSON.parse(responseText);
    console.log('✅ API call successful!');
    console.log('Model:', data.model);
    console.log('Answer:', data.choices?.[0]?.message?.content?.substring(0, 200));
  } else {
    console.error('❌ API call failed');
    try {
      const errorData = JSON.parse(responseText);
      console.error('Error details:', JSON.stringify(errorData, null, 2));
    } catch {
      console.error('Error response (not JSON):', responseText.substring(0, 500));
    }
  }
} catch (error) {
  console.error('❌ Error making API call:', error.message);
  console.error(error);
  process.exit(1);
}
