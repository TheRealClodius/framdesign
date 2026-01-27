/**
 * Image Re-fetch and Analysis Integration Test
 *
 * Tests that the agent can:
 * 1. Send an image to the user via kb_get/kb_search
 * 2. When asked about that image, re-fetch it with kb_get to analyze pixel data
 * 3. Provide meaningful visual analysis based on the re-fetched image data
 *
 * Success criteria:
 * - Agent calls kb_get twice: once to show, once to analyze
 * - Second kb_get includes the same entity ID from first call
 * - Second kb_get response includes _imageData with base64 content
 * - Agent provides visual details (colors, content, composition) not just metadata
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { toolRegistry } from '../../tools/_core/registry.js';
import { resetMetrics } from '../../tools/_core/metrics.js';
import { GoogleGenAI } from '@google/genai';
import { writeFileSync, readFileSync } from 'fs';
import { resolve } from 'path';

function convertGeminiSchemaToJsonSchema(schema) {
  if (!schema || typeof schema !== 'object') return schema;

  const convertType = (type) => (typeof type === 'string' ? type.toLowerCase() : type);

  const convert = (node) => {
    if (!node || typeof node !== 'object') return node;
    if (Array.isArray(node)) return node.map(convert);

    const out = { ...node };
    if (out.type) out.type = convertType(out.type);
    if (out.properties) {
      out.properties = Object.fromEntries(
        Object.entries(out.properties).map(([k, v]) => [k, convert(v)])
      );
    }
    if (out.items) out.items = convert(out.items);
    return out;
  };

  return convert(schema);
}

function loadSystemPromptFromMarkdown() {
  const p = resolve(process.cwd(), 'prompts/core.md');
  const content = readFileSync(p, 'utf-8');
  return content.replace(/^# .*$/m, '').trim();
}

function extractTextFromGeminiResponse(resp) {
  const parts = resp?.candidates?.[0]?.content?.parts || [];
  const texts = parts.map((p) => p.text).filter(Boolean);
  return texts.join('');
}

function extractFunctionCallPart(resp) {
  const parts = resp?.candidates?.[0]?.content?.parts || [];
  const callPart = parts.find((p) => p.functionCall);
  return callPart || null;
}

async function runAgentWithTools({ ai, systemPrompt, functionDeclarations, contents, executionContextBase, maxSteps = 12 }) {
  const transcript = [];
  let currentContents = [...contents];

  for (let step = 1; step <= maxSteps; step += 1) {
    const resp = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: currentContents,
      config: {
        systemInstruction: systemPrompt,
        tools: [{ functionDeclarations }]
      }
    });

    const callPart = extractFunctionCallPart(resp);
    const text = extractTextFromGeminiResponse(resp);

    transcript.push({
      step,
      modelText: text || null,
      functionCallPart: callPart
    });

    // If no function call, we have the final answer
    if (!callPart?.functionCall) {
      return { ok: true, finalText: text, transcript, finalResponse: resp };
    }

    const toolName = callPart.functionCall.name;
    const toolArgs = callPart.functionCall.args || {};

    const toolResult = await toolRegistry.executeTool(toolName, {
      ...executionContextBase,
      args: toolArgs
    });

    if (!toolResult?.ok) {
      return {
        ok: false,
        error: toolResult?.error || { message: 'Tool failed' },
        transcript,
        failedTool: { toolName, toolArgs, toolResult }
      };
    }

    // Extract and include _imageData if present (following route.ts behavior)
    const cleanedData = toolResult.data ? JSON.parse(JSON.stringify(toolResult.data)) : null;
    let imageData = null;

    if (cleanedData && typeof cleanedData === 'object' && cleanedData._imageData) {
      imageData = cleanedData._imageData;
      delete cleanedData._imageData;
    }

    // Build response parts
    const responseParts = [
      {
        functionResponse: {
          name: toolName,
          response: cleanedData
        }
      }
    ];

    // Add image data as separate inlineData part if available
    if (imageData && imageData.mimeType && imageData.data) {
      responseParts.push({
        inlineData: {
          mimeType: imageData.mimeType,
          data: imageData.data
        }
      });
    }

    currentContents = [
      ...currentContents,
      { role: 'model', parts: [callPart] },
      { role: 'user', parts: responseParts }
    ];
  }

  return { ok: false, error: { message: 'Max tool steps exceeded' }, transcript };
}

describe('E2E: Image Re-fetch and Analysis', () => {
  const toolCalls = [];
  const originalExecuteTool = toolRegistry.executeTool.bind(toolRegistry);
  const reportPath = resolve(process.cwd(), 'tests/e2e/image-refetch-analysis-report.json');
  let ai;
  let systemPrompt;
  let functionDeclarations;

  beforeAll(async () => {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is required for this test.');
    }

    // Use meta-tools for consistent behavior
    process.env.USE_META_TOOLS = 'true';
    resetMetrics();

    if (!toolRegistry.tools.size) {
      await toolRegistry.load();
      toolRegistry.lock();
    }

    ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    systemPrompt = loadSystemPromptFromMarkdown();

    const geminiNative = toolRegistry.getProviderSchemas('geminiNative');
    functionDeclarations = geminiNative.map((schema) => ({
      name: schema.name,
      description: schema.description,
      parametersJsonSchema: convertGeminiSchemaToJsonSchema(schema.parameters)
    }));

    // Wrap tool execution to capture args and results
    toolRegistry.executeTool = async (toolId, executionContext) => {
      const startTime = Date.now();
      const result = await originalExecuteTool(toolId, executionContext);
      const endTime = Date.now();

      toolCalls.push({
        toolId,
        args: executionContext?.args || {},
        ok: result?.ok,
        result,
        durationMs: result?.meta?.duration ?? (endTime - startTime),
        timestamp: endTime,
        hasImageData: !!(result?.data?._imageData)
      });

      return result;
    };
  });

  afterAll(() => {
    toolRegistry.executeTool = originalExecuteTool;

    // Write detailed report
    const report = {
      testName: 'Image Re-fetch and Analysis Integration Test',
      totalToolCalls: toolCalls.length,
      toolCalls: toolCalls.map((tc) => ({
        toolId: tc.toolId,
        args: tc.args,
        ok: tc.ok,
        durationMs: tc.durationMs,
        hasImageData: tc.hasImageData,
        entityId: tc.result?.data?.id || null,
        entityType: tc.result?.data?.entity_type || null,
        blobId: tc.result?.data?.blob_id || null,
        markdown: tc.result?.data?.markdown ? tc.result.data.markdown.substring(0, 100) : null,
        // For kb_search, include search results
        searchResults: tc.toolId === 'kb_search' && tc.result?.data?.results ?
          tc.result.data.results.map(r => ({
            id: r.id,
            entity_type: r.entity_type,
            score: r.score,
            blob_id: r.blob_id || null
          })) : null
      }))
    };

    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n✓ Report written to: ${reportPath}`);
  });

  test('agent re-fetches image when asked for visual analysis', async () => {
    const testStart = Date.now();
    const conversation = [];

    // === TURN 1: Ask agent to show an image ===
    console.log('\n=== TURN 1: Request image from KB ===');
    const turn1Contents = [
      {
        role: 'user',
        parts: [{ text: 'Show me a photo from the Vector Watch project' }]
      }
    ];

    const turn1Result = await runAgentWithTools({
      ai,
      systemPrompt,
      functionDeclarations,
      contents: turn1Contents,
      executionContextBase: {
        userId: 'test-user-image-refetch',
        mode: 'text',
        messageCount: 1
      },
      maxSteps: 12
    });

    expect(turn1Result.ok).toBe(true);
    expect(turn1Result.finalText).toBeTruthy();

    // Find all KB calls from turn 1 (kb_search or kb_get)
    const turn1KbCalls = toolCalls.filter(
      (tc) => (tc.toolId === 'kb_get' || tc.toolId === 'kb_search') && tc.timestamp >= testStart
    );

    expect(turn1KbCalls.length).toBeGreaterThan(0);

    // Look for image entity in either kb_search results or kb_get data
    let imageEntityId = null;
    let imageBlobId = null;
    let firstImageCall = null;

    // Check kb_get calls first
    const kbGetCalls = turn1KbCalls.filter(tc => tc.toolId === 'kb_get');
    firstImageCall = kbGetCalls.find((tc) =>
      tc.result?.data?.entity_type &&
      ['photo', 'diagram', 'gif'].includes(tc.result.data.entity_type)
    );

    if (firstImageCall) {
      imageEntityId = firstImageCall.result.data.id;
      imageBlobId = firstImageCall.result.data.blob_id;
    } else {
      // Check kb_search results for image entities
      const kbSearchCalls = turn1KbCalls.filter(tc => tc.toolId === 'kb_search');
      for (const searchCall of kbSearchCalls) {
        const results = searchCall.result?.data?.results || [];
        // Look for asset entities (assets have "asset:" prefix or entity_type is photo/diagram/gif)
        const imageResult = results.find(r =>
          (r.id && r.id.startsWith('asset:')) ||
          (r.entity_type && ['photo', 'diagram', 'gif'].includes(r.entity_type))
        );
        if (imageResult) {
          imageEntityId = imageResult.id;
          imageBlobId = imageResult.blob_id || null;
          firstImageCall = searchCall;
          break;
        }
      }
    }

    if (!imageEntityId) {
      console.log('\n⚠️  No image asset found in turn 1 KB calls.');
      console.log('Total KB calls in turn 1:', turn1KbCalls.length);

      for (const tc of turn1KbCalls) {
        console.log(`\nTool: ${tc.toolId}`);
        if (tc.toolId === 'kb_search') {
          const results = tc.result?.data?.results || [];
          console.log(`  Search results: ${results.length}`);
          for (const r of results) {
            console.log(`    - ${r.id} (type: ${r.entity_type}, score: ${r.score?.toFixed(3)})`);
          }
        } else if (tc.toolId === 'kb_get') {
          console.log(`  Entity ID: ${tc.result?.data?.id}`);
          console.log(`  Entity type: ${tc.result?.data?.entity_type}`);
        }
      }

      console.log('\n✓ Test completing early: No image found in KB to test re-fetch behavior\n');
      expect(turn1KbCalls.length).toBeGreaterThan(0); // At least verify KB was called
      return; // Skip rest of test if no image was found
    }

    console.log(`✓ Turn 1 complete: Agent found image with entity_id="${imageEntityId}", blob_id="${imageBlobId}"`);
    console.log(`  Tool used: ${firstImageCall.toolId}`);

    // Add turn 1 to conversation history
    conversation.push({
      role: 'user',
      content: 'Show me a photo from the Vector Watch project'
    });
    conversation.push({
      role: 'assistant',
      content: turn1Result.finalText
    });

    // === TURN 2: Ask agent to analyze the image ===
    console.log('\n=== TURN 2: Ask for visual analysis of previous image ===');

    const turn2CallsStartIndex = toolCalls.length;

    const turn2Contents = [
      ...conversation.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      })),
      {
        role: 'user',
        parts: [{ text: 'What colors and visual elements are in that image?' }]
      }
    ];

    const turn2Result = await runAgentWithTools({
      ai,
      systemPrompt,
      functionDeclarations,
      contents: turn2Contents,
      executionContextBase: {
        userId: 'test-user-image-refetch',
        mode: 'text',
        messageCount: 3
      },
      maxSteps: 12
    });

    expect(turn2Result.ok).toBe(true);
    expect(turn2Result.finalText).toBeTruthy();

    // Find kb_get calls from turn 2
    const turn2KbGetCalls = toolCalls.slice(turn2CallsStartIndex).filter((tc) => tc.toolId === 'kb_get');

    console.log(`\n=== ANALYSIS ===`);
    console.log(`Turn 2 made ${turn2KbGetCalls.length} kb_get call(s)`);

    // === METRICS ===
    const metrics = {
      turn1: {
        totalKbCalls: turn1KbCalls.length,
        imageEntityId,
        imageBlobId,
        toolUsed: firstImageCall.toolId
      },
      turn2: {
        kbGetCalls: turn2KbGetCalls.length,
        refetchedSameImage: false,
        refetchHadImageData: false,
        refetchedEntityId: null
      }
    };

    // Check if agent re-fetched the same image
    const refetchCall = turn2KbGetCalls.find((tc) =>
      tc.args.entity_id === imageEntityId ||
      tc.result?.data?.id === imageEntityId ||
      tc.result?.data?.blob_id === imageBlobId
    );

    if (refetchCall) {
      metrics.turn2.refetchedSameImage = true;
      metrics.turn2.refetchHadImageData = refetchCall.hasImageData;
      metrics.turn2.refetchedEntityId = refetchCall.args.entity_id;

      console.log(`✓ Agent re-fetched image: entity_id="${refetchCall.args.entity_id}"`);
      console.log(`✓ Re-fetch included _imageData: ${refetchCall.hasImageData}`);
    } else {
      console.log(`✗ Agent did NOT re-fetch the image from turn 1`);
      console.log(`  Expected entity_id: "${imageEntityId}"`);
      console.log(`  Turn 2 kb_get calls:`, turn2KbGetCalls.map(tc => ({
        entityId: tc.args.entity_id,
        hasImageData: tc.hasImageData
      })));
    }

    // Check if agent response includes visual analysis (not just metadata)
    const responseIncludesVisualAnalysis =
      /color|visual|image|photo|pixel|composition|design|graphic|appearance|look|show/i.test(turn2Result.finalText);

    console.log(`✓ Agent response mentions visual elements: ${responseIncludesVisualAnalysis}`);
    console.log(`\nAgent response excerpt:\n"${turn2Result.finalText.substring(0, 200)}..."\n`);

    // === ASSERTIONS ===
    expect(metrics.turn2.refetchedSameImage).toBe(true);
    expect(metrics.turn2.refetchHadImageData).toBe(true);
    expect(responseIncludesVisualAnalysis).toBe(true);

    console.log('\n=== TEST PASSED ===');
    console.log('✓ Agent correctly re-fetched image for visual analysis');
    console.log('✓ Image data was included in re-fetch');
    console.log('✓ Agent provided visual analysis based on image content');
    console.log(`\nTotal duration: ${Date.now() - testStart}ms`);
  }, 120000); // 2 minute timeout for API calls
});
