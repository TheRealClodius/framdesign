#!/usr/bin/env node

/**
 * Diagnostic script to test Gemini caching behavior
 * Tests cache creation and usage to identify performance issues
 */

import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';

// Load environment variables
const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.error('❌ GEMINI_API_KEY not set');
  process.exit(1);
}

// Load system prompt
const promptsDir = path.join(process.cwd(), 'prompts');
const corePrompt = fs.readFileSync(path.join(promptsDir, 'core.md'), 'utf-8');
const ignoreUserPrompt = fs.readFileSync(path.join(promptsDir, 'tools/ignore_user.md'), 'utf-8');
const systemPrompt = `${corePrompt}\n\n${ignoreUserPrompt}`;

console.log('=== System Prompt Analysis ===');
console.log(`Size: ${systemPrompt.length} characters`);
console.log(`Estimated tokens: ~${Math.ceil(systemPrompt.length / 4)}`);
console.log('');

// Initialize AI client
const ai = new GoogleGenAI({ apiKey });

// Test 1: Check if caches API is available
console.log('=== Test 1: Check Caches API ===');
if (!ai.caches || typeof ai.caches.create !== 'function') {
  console.error('❌ Caches API not available');
  process.exit(1);
}
console.log('✓ Caches API is available');
console.log('');

// Test 2: Create a cache
console.log('=== Test 2: Create System Prompt Cache ===');
const startCreate = Date.now();

try {
  const systemContent = [
    {
      role: "user",
      parts: [{ text: systemPrompt }],
    },
    {
      role: "model",
      parts: [{ text: "UNDERSTOOD." }],
    }
  ];

  console.log('Creating cache...');
  const cache = await ai.caches.create({
    model: "gemini-3-flash-preview",
    config: {
      systemInstruction: systemPrompt,
      contents: systemContent,
      tools: [], // No tools for this test
      ttl: "3600s",
      displayName: "diagnostic-test-cache"
    }
  });

  const createDuration = Date.now() - startCreate;
  console.log(`✓ Cache created successfully in ${createDuration}ms`);
  console.log(`Cache name: ${cache.name}`);
  console.log('');

  // Test 3: Use the cache
  console.log('=== Test 3: Make Request With Cache ===');
  const startRequest = Date.now();

  const result = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [{
      role: "user",
      parts: [{ text: "Say 'hello' in exactly one word." }]
    }],
    config: {
      cachedContent: cache.name
    }
  });

  const requestDuration = Date.now() - startRequest;
  const response = result.candidates?.[0]?.content?.parts?.[0]?.text || 'No response';

  console.log(`✓ Request completed in ${requestDuration}ms`);
  console.log(`Response: ${response}`);
  console.log('');

  // Test 4: Make request WITHOUT cache
  console.log('=== Test 4: Make Request WITHOUT Cache ===');
  const startNoCache = Date.now();

  const resultNoCache = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [{
      role: "user",
      parts: [{ text: "Say 'hello' in exactly one word." }]
    }],
    config: {
      systemInstruction: systemPrompt
    }
  });

  const noCacheDuration = Date.now() - startNoCache;
  const responseNoCache = resultNoCache.candidates?.[0]?.content?.parts?.[0]?.text || 'No response';

  console.log(`✓ Request completed in ${noCacheDuration}ms`);
  console.log(`Response: ${responseNoCache}`);
  console.log('');

  // Compare performance
  console.log('=== Performance Comparison ===');
  console.log(`Cache creation time: ${createDuration}ms`);
  console.log(`With cache: ${requestDuration}ms`);
  console.log(`Without cache: ${noCacheDuration}ms`);
  console.log(`Speedup: ${((noCacheDuration - requestDuration) / noCacheDuration * 100).toFixed(1)}%`);
  console.log('');

  // Test 5: Check if cache timeouts are problematic
  console.log('=== Test 5: Cache Creation with Timeout ===');
  const startTimeout = Date.now();

  const cachePromise = ai.caches.create({
    model: "gemini-3-flash-preview",
    config: {
      systemInstruction: systemPrompt,
      contents: systemContent,
      tools: [],
      ttl: "3600s",
      displayName: "timeout-test-cache"
    }
  });

  const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(null), 100));
  const raceResult = await Promise.race([cachePromise, timeoutPromise]);
  const timeoutTestDuration = Date.now() - startTimeout;

  if (raceResult === null) {
    console.log(`⚠️  Cache creation timed out at 100ms (actual time: ${timeoutTestDuration}ms)`);
    console.log('    This means the fast-path optimization is failing!');
  } else {
    console.log(`✓ Cache created within 100ms timeout (${timeoutTestDuration}ms)`);
  }
  console.log('');

  // Cleanup
  console.log('=== Cleanup ===');
  try {
    await ai.caches.delete({ name: cache.name });
    console.log('✓ Test cache deleted');
  } catch (e) {
    console.warn('⚠️  Could not delete test cache:', e.message);
  }

  if (raceResult) {
    try {
      await ai.caches.delete({ name: raceResult.name });
      console.log('✓ Timeout test cache deleted');
    } catch (e) {
      console.warn('⚠️  Could not delete timeout test cache:', e.message);
    }
  }

} catch (error) {
  const createDuration = Date.now() - startCreate;
  console.error(`❌ Error after ${createDuration}ms:`, error.message);
  if (error.stack) {
    console.error('Stack trace:', error.stack);
  }
  process.exit(1);
}

console.log('');
console.log('=== Diagnosis Complete ===');
console.log('');
console.log('Key Findings:');
console.log('- If cache creation takes > 100ms, fast-path optimization fails');
console.log('- This forces every request to send the full system prompt');
console.log('- Recommendation: Increase timeout or remove race condition');
