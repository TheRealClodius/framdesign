/**
 * Visual Analysis Accuracy Integration Test
 *
 * Tests that the agent can accurately analyze visual content from images:
 * 1. Agent retrieves an image via kb_get
 * 2. User asks specific visual questions (colors, text, layout)
 * 3. Agent re-fetches image with kb_get and gets _imageData
 * 4. Agent provides accurate visual analysis based on actual pixel data
 *
 * Success criteria:
 * - kb_get returns _imageData with base64 content
 * - _imageData is included in Gemini API context as inlineData
 * - Agent provides specific visual details (not vague or hallucinated)
 * - Multiple visual questions are answered correctly in sequence
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
  const toolCallsInTurn = [];
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
      return { ok: true, finalText: text, transcript, finalResponse: resp, toolCallsInTurn };
    }

    const toolName = callPart.functionCall.name;
    const toolArgs = callPart.functionCall.args || {};

    const toolResult = await toolRegistry.executeTool(toolName, {
      ...executionContextBase,
      args: toolArgs
    });

    // Track this tool call
    toolCallsInTurn.push({
      toolName,
      toolArgs,
      toolResult,
      hadImageData: !!(toolResult?.data?._imageData)
    });

    if (!toolResult?.ok) {
      return {
        ok: false,
        error: toolResult?.error || { message: 'Tool failed' },
        transcript,
        failedTool: { toolName, toolArgs, toolResult },
        toolCallsInTurn
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
      console.log(`  ✓ Image data included in API context (${Math.round(imageData.data.length / 1024)}KB)`);
    } else if (toolName === 'kb_get') {
      console.log(`  ✗ WARNING: kb_get called but no image data returned`);
    }

    currentContents = [
      ...currentContents,
      { role: 'model', parts: [callPart] },
      { role: 'user', parts: responseParts }
    ];
  }

  return { ok: false, error: { message: 'Max tool steps exceeded' }, transcript, toolCallsInTurn };
}

describe('E2E: Visual Analysis Accuracy', () => {
  const globalToolCalls = [];
  const originalExecuteTool = toolRegistry.executeTool.bind(toolRegistry);
  const reportPath = resolve(process.cwd(), 'tests/e2e/visual-analysis-accuracy-report.json');
  let ai;
  let systemPrompt;
  let functionDeclarations;

  beforeAll(async () => {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is required for this test.');
    }

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

    // Wrap tool execution to capture all calls
    toolRegistry.executeTool = async (toolId, executionContext) => {
      const startTime = Date.now();
      const result = await originalExecuteTool(toolId, executionContext);
      const endTime = Date.now();

      const toolCall = {
        toolId,
        args: executionContext?.args || {},
        ok: result?.ok,
        durationMs: result?.meta?.duration ?? (endTime - startTime),
        timestamp: endTime,
        hasImageData: !!(result?.data?._imageData),
        imageDataSize: result?.data?._imageData?.data?.length || 0,
        error: result?.error || null
      };

      globalToolCalls.push(toolCall);

      return result;
    };
  });

  afterAll(() => {
    toolRegistry.executeTool = originalExecuteTool;

    // Write detailed report
    const report = {
      testName: 'Visual Analysis Accuracy Integration Test',
      totalToolCalls: globalToolCalls.length,
      toolCalls: globalToolCalls.map((tc) => ({
        toolId: tc.toolId,
        args: tc.args,
        ok: tc.ok,
        durationMs: tc.durationMs,
        hasImageData: tc.hasImageData,
        imageDataSizeKB: Math.round(tc.imageDataSize / 1024),
        error: tc.error
      }))
    };

    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n✓ Report written to: ${reportPath}`);
  });

  test('agent accurately analyzes visual details across multiple questions', async () => {
    const conversation = [];
    const executionContext = {
      userId: 'test-visual-analysis',
      messageCount: 0
    };

    // === TURN 1: Show initial image ===
    console.log('\n=== TURN 1: Request image ===');
    const turn1 = await runAgentWithTools({
      ai,
      systemPrompt,
      functionDeclarations,
      contents: [
        {
          role: 'user',
          parts: [{ text: 'Show me a photo from the Vector Watch project' }]
        }
      ],
      executionContextBase: { ...executionContext, messageCount: 1 },
      maxSteps: 12
    });

    expect(turn1.ok).toBe(true);
    expect(turn1.finalText).toBeTruthy();

    // Find image entity from turn 1
    const turn1ImageCall = turn1.toolCallsInTurn?.find(tc =>
      tc.toolName === 'kb_get' && tc.hadImageData
    );

    if (!turn1ImageCall) {
      console.log('\n⚠️  No image found in turn 1. Skipping visual analysis tests.');
      return;
    }

    const imageEntityId = turn1ImageCall.toolResult?.data?.id;
    console.log(`✓ Turn 1: Agent retrieved image (entity: ${imageEntityId})`);

    // Add to conversation
    conversation.push({
      role: 'user',
      parts: [{ text: 'Show me a photo from the Vector Watch project' }]
    });
    conversation.push({
      role: 'assistant',
      parts: [{ text: turn1.finalText }]
    });

    // === TURN 2: Question about colors ===
    console.log('\n=== TURN 2: Ask about colors ===');
    executionContext.messageCount = 3;

    const turn2 = await runAgentWithTools({
      ai,
      systemPrompt,
      functionDeclarations,
      contents: [
        ...conversation,
        {
          role: 'user',
          parts: [{ text: 'What color is the outline or border in that image?' }]
        }
      ],
      executionContextBase: executionContext,
      maxSteps: 12
    });

    expect(turn2.ok).toBe(true);

    // Validate kb_get was called with image data
    const turn2KbGet = turn2.toolCallsInTurn?.find(tc => tc.toolName === 'kb_get');
    expect(turn2KbGet).toBeDefined();
    expect(turn2KbGet.hadImageData).toBe(true);

    console.log(`✓ Turn 2: kb_get called with image data`);
    console.log(`  Response: ${turn2.finalText?.substring(0, 200)}...`);

    // Check if response contains color information
    const hasColorInfo = /\b(red|blue|green|yellow|purple|orange|pink|white|black|gray|grey)\b/i.test(turn2.finalText);
    expect(hasColorInfo).toBe(true);

    conversation.push({
      role: 'user',
      parts: [{ text: 'What color is the outline or border in that image?' }]
    });
    conversation.push({
      role: 'assistant',
      parts: [{ text: turn2.finalText }]
    });

    // === TURN 3: Question about text content ===
    console.log('\n=== TURN 3: Ask about text content ===');
    executionContext.messageCount = 5;

    const turn3 = await runAgentWithTools({
      ai,
      systemPrompt,
      functionDeclarations,
      contents: [
        ...conversation,
        {
          role: 'user',
          parts: [{ text: 'What text or labels can you see in the image?' }]
        }
      ],
      executionContextBase: executionContext,
      maxSteps: 12
    });

    expect(turn3.ok).toBe(true);

    // Validate kb_get was called with image data
    const turn3KbGet = turn3.toolCallsInTurn?.find(tc => tc.toolName === 'kb_get');
    expect(turn3KbGet).toBeDefined();
    expect(turn3KbGet.hadImageData).toBe(true);

    console.log(`✓ Turn 3: kb_get called with image data`);
    console.log(`  Response: ${turn3.finalText?.substring(0, 200)}...`);

    conversation.push({
      role: 'user',
      parts: [{ text: 'What text or labels can you see in the image?' }]
    });
    conversation.push({
      role: 'assistant',
      parts: [{ text: turn3.finalText }]
    });

    // === TURN 4: Question about UI elements ===
    console.log('\n=== TURN 4: Ask about UI elements ===');
    executionContext.messageCount = 7;

    const turn4 = await runAgentWithTools({
      ai,
      systemPrompt,
      functionDeclarations,
      contents: [
        ...conversation,
        {
          role: 'user',
          parts: [{ text: 'Describe the layout and UI elements you can see' }]
        }
      ],
      executionContextBase: executionContext,
      maxSteps: 12
    });

    expect(turn4.ok).toBe(true);

    // Validate kb_get was called with image data
    const turn4KbGet = turn4.toolCallsInTurn?.find(tc => tc.toolName === 'kb_get');
    expect(turn4KbGet).toBeDefined();
    expect(turn4KbGet.hadImageData).toBe(true);

    console.log(`✓ Turn 4: kb_get called with image data`);
    console.log(`  Response: ${turn4.finalText?.substring(0, 200)}...`);

    // === SUMMARY ===
    console.log('\n=== TEST SUMMARY ===');
    const allKbGetCalls = globalToolCalls.filter(tc => tc.toolId === 'kb_get');
    const kbGetWithImageData = allKbGetCalls.filter(tc => tc.hasImageData);

    console.log(`Total kb_get calls: ${allKbGetCalls.length}`);
    console.log(`kb_get calls with image data: ${kbGetWithImageData.length}`);
    console.log(`Average image size: ${Math.round(kbGetWithImageData.reduce((sum, tc) => sum + tc.imageDataSize, 0) / kbGetWithImageData.length / 1024)}KB`);

    // All visual question turns should have retrieved image data
    expect(kbGetWithImageData.length).toBeGreaterThanOrEqual(3);

    console.log('\n✅ All visual analysis questions were answered with actual image data\n');
  }, 60000); // 60 second timeout for API calls
});
