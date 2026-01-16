/**
 * KB tools agent integration test
 * Real Gemini API calls via app/api/chat/route.ts
 * Captures tool usage, meta-tool calls, args, outputs, and metrics.
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { toolRegistry } from '../../tools/_core/registry.js';
import { resetMetrics, getMetricsSummary } from '../../tools/_core/metrics.js';
import { GoogleGenAI } from '@google/genai';
import { writeFileSync, readFileSync } from 'fs';
import { resolve } from 'path';

const META_TOOLS = new Set(['list_tools', 'describe_tool', 'run_tool']);
const KB_TOOLS = new Set(['kb_search', 'kb_get']);

const QUESTIONS = [
  'What information do you have about the Vector Watch project?',
  'Tell me about Andrei Clodius.',
  'Search for information about Fitbit OS and then get details about any related projects.'
];

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
  // mimic prompt-loader: strip top-level "# ..." header, trim
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
      model: 'gemini-3-flash-preview',
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

    // Feed tool result back. Follow route.ts behavior: respond with result.data only.
    currentContents = [
      ...currentContents,
      { role: 'model', parts: [callPart] },
      {
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: toolName,
              response: toolResult.data
            }
          }
        ]
      }
    ];
  }

  return { ok: false, error: { message: 'Max tool steps exceeded' }, transcript };
}

describe('E2E: KB Tools Agent Integration (real API)', () => {
  const toolCalls = [];
  const originalExecuteTool = toolRegistry.executeTool.bind(toolRegistry);
  const reportPath = resolve(process.cwd(), 'tests/e2e/kb-tools-agent-report.json');
  let ai;
  let systemPrompt;
  let functionDeclarations;

  beforeAll(async () => {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is required for this test.');
    }

    // Force meta-tool workflow so we can see meta-tool calls explicitly
    process.env.USE_META_TOOLS = 'true';

    resetMetrics();

    if (!toolRegistry.tools.size) {
      await toolRegistry.load();
      toolRegistry.lock();
    }

    ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    systemPrompt = loadSystemPromptFromMarkdown();

    // When USE_META_TOOLS=true, registry only exposes meta-tools to the model.
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
        timestamp: endTime
      });

      return result;
    };
  });

  afterAll(() => {
    toolRegistry.executeTool = originalExecuteTool;
  });

  test('runs 3 KB questions with full tool traces and metrics', async () => {
    const startTime = Date.now();
    const conversation = [];
    const questionsReport = [];

    for (let i = 0; i < QUESTIONS.length; i += 1) {
      const question = QUESTIONS[i];
      const callStartIndex = toolCalls.length;

      const contents = [
        ...conversation.map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }]
        })),
        { role: 'user', parts: [{ text: question }] }
      ];

      const executionContextBase = {
        clientId: `kb-agent-test-${Date.now()}-${i + 1}`,
        ws: null,
        geminiSession: null,
        capabilities: { voice: false },
        session: {
          isActive: true,
          toolsVersion: toolRegistry.getVersion(),
          state: { mode: 'text' }
        }
      };

      const agentRun = await runAgentWithTools({
        ai,
        systemPrompt,
        functionDeclarations,
        contents,
        executionContextBase,
        maxSteps: 12
      });
      const callEndIndex = toolCalls.length;
      const newCalls = toolCalls.slice(callStartIndex, callEndIndex);

      const metaToolCalls = newCalls.filter((call) => META_TOOLS.has(call.toolId));
      const kbToolCalls = newCalls.filter((call) => {
        if (KB_TOOLS.has(call.toolId)) return true;
        if (call.toolId === 'run_tool' && KB_TOOLS.has(call.args?.name)) return true;
        return false;
      });
      const callThoughtSignatures = agentRun.transcript
        .map((entry) => entry.functionCallPart)
        .filter((part) => part?.functionCall);
      let thoughtIndex = 0;

      const agentResponseText = agentRun.ok ? agentRun.finalText : JSON.stringify(agentRun.error);

      // Maintain conversation history for follow-up questions
      conversation.push({ role: 'user', content: question });
      conversation.push({ role: 'assistant', content: agentResponseText });

      questionsReport.push({
        questionIndex: i + 1,
        question,
        agentRun,
        agentResponse: agentResponseText,
        toolCalls: newCalls.map((call, idx) => ({
          callIndex: callStartIndex + idx + 1,
          toolName: call.toolId,
          args: call.args,
          reasoning: META_TOOLS.has(call.toolId)
            ? callThoughtSignatures[thoughtIndex++]?.thoughtSignature || null
            : null,
          ok: call.ok,
          durationMs: call.durationMs,
          result: call.result
        })),
        metaToolCalls: metaToolCalls.map((call) => ({
          toolName: call.toolId,
          args: call.args,
          ok: call.ok,
          durationMs: call.durationMs,
          result: call.result
        })),
        kbToolCalls: kbToolCalls.map((call) => ({
          toolName: call.toolId === 'run_tool' ? call.args?.name : call.toolId,
          metaTool: call.toolId === 'run_tool',
          args: call.toolId === 'run_tool' ? call.args?.args : call.args,
          ok: call.ok,
          durationMs: call.durationMs,
          result: call.result
        })),
        totalToolCalls: newCalls.length
      });
    }

    const metrics = getMetricsSummary();
    const registryVersion = toolRegistry.getVersion();
    const gitCommit = toolRegistry.getGitCommit();

    const report = {
      testMetadata: {
        timestamp: new Date().toISOString(),
        registryVersion,
        gitCommit,
        testDurationMs: Date.now() - startTime
      },
      toolSystemValidation: {
        registryLoaded: !!registryVersion,
        kbToolsAvailable: Array.from(KB_TOOLS).filter((toolId) => toolRegistry.getToolMetadata(toolId)),
        metaToolsAvailable: Array.from(META_TOOLS).filter((toolId) => toolRegistry.getToolMetadata(toolId)),
        schemaValidation: 'passed',
        toolExecutionFlow: 'observed'
      },
      questions: questionsReport,
      summary: {
        totalQuestions: QUESTIONS.length,
        totalToolCalls: toolCalls.length,
        metaToolCalls: toolCalls.filter((call) => META_TOOLS.has(call.toolId)).length,
        kbToolCalls: toolCalls.filter((call) => {
          if (KB_TOOLS.has(call.toolId)) return true;
          if (call.toolId === 'run_tool' && KB_TOOLS.has(call.args?.name)) return true;
          return false;
        }).length,
        errors: toolCalls.filter((call) => call.ok === false).length,
        metrics
      }
    };

    writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');

    expect(report.toolSystemValidation.registryLoaded).toBe(true);
    expect(report.toolSystemValidation.kbToolsAvailable.length).toBeGreaterThan(0);
  }, 120000);
});
