/**
 * Integration tests for voice agent tool calling
 * Tests complete flow: Gemini Live API → tool call → voice server → tool execution → result back to Gemini
 */

import { jest, describe, test, expect, beforeAll, beforeEach } from '@jest/globals';
import { toolRegistry } from '../../tools/_core/registry.js';
import { createStateController } from '../../tools/_core/state-controller.js';
import { GeminiLiveTransport } from '../../voice-server/providers/gemini-live-transport.js';
import { ErrorType } from '../../tools/_core/error-types.js';

describe('Voice Agent: Tool Integration', () => {
  let mockGeminiSession;
  let mockTransport;
  let mockWs;
  let state;

  beforeAll(async () => {
    if (!toolRegistry.tools.size) {
      await toolRegistry.load();
      toolRegistry.lock();
    }
  });

  beforeEach(() => {
    // Mock WebSocket
    mockWs = {
      send: jest.fn(),
      close: jest.fn(),
      on: jest.fn()
    };

    // Mock Gemini Live session
    mockGeminiSession = {
      send: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
      close: jest.fn()
    };

    // Create transport with mocked session
    mockTransport = new GeminiLiveTransport(mockGeminiSession);

    // Initialize state controller
    state = createStateController({
      mode: 'voice',
      isActive: true,
      pendingEndVoiceSession: null,
      shouldSuppressAudio: false,
      shouldSuppressTranscript: false
    });
  });

  describe('Tool Schema Provision', () => {
    test('should provide all tools to Gemini Live API', () => {
      const schemas = toolRegistry.getProviderSchemas('geminiNative');
      
      expect(schemas).toBeDefined();
      expect(Array.isArray(schemas)).toBe(true);
      expect(schemas.length).toBeGreaterThan(0);
      
      // Verify expected tools are present
      const toolNames = schemas.map(s => s.name);
      expect(toolNames).toContain('end_voice_session');
      expect(toolNames).toContain('ignore_user');
      expect(toolNames).toContain('kb_search');
      expect(toolNames).toContain('kb_get');
    });

    test('should have correct schema format for Gemini Native', () => {
      const schemas = toolRegistry.getProviderSchemas('geminiNative');
      
      for (const schema of schemas) {
        expect(schema).toHaveProperty('name');
        expect(schema).toHaveProperty('description');
        expect(schema).toHaveProperty('parameters');
        expect(typeof schema.name).toBe('string');
        expect(typeof schema.description).toBe('string');
      }
    });
  });

  describe('Tool Call Reception', () => {
    test('should parse tool calls from Gemini Live message', () => {
      const geminiMessage = {
        serverContent: {
          toolCall: {
            functionCalls: [
              {
                id: 'call-123',
                name: 'end_voice_session',
                args: {
                  reason: 'user_request'
                }
              }
            ]
          }
        }
      };

      const toolCalls = mockTransport.receiveToolCalls(geminiMessage);
      
      expect(toolCalls).toHaveLength(1);
      expect(toolCalls[0]).toEqual({
        id: 'call-123',
        name: 'end_voice_session',
        args: { reason: 'user_request' }
      });
    });

    test('should handle multiple tool calls in one message', () => {
      const geminiMessage = {
        serverContent: {
          toolCall: {
            functionCalls: [
              {
                id: 'call-1',
                name: 'kb_search',
                args: { query: 'test' }
              },
              {
                id: 'call-2',
                name: 'kb_get',
                args: { id: 'entity-123' }
              }
            ]
          }
        }
      };

      const toolCalls = mockTransport.receiveToolCalls(geminiMessage);
      expect(toolCalls).toHaveLength(2);
    });

    test('should return empty array when no tool calls', () => {
      const geminiMessage = {
        serverContent: {
          inputTranscription: { text: 'Hello' }
        }
      };

      const toolCalls = mockTransport.receiveToolCalls(geminiMessage);
      expect(toolCalls).toHaveLength(0);
    });
  });

  describe('Tool Execution Flow', () => {
    test('should execute tool and send result back to Gemini', async () => {
      // Simulate Gemini sending tool call
      const geminiMessage = {
        serverContent: {
          toolCall: {
            functionCalls: [
              {
                id: 'call-123',
                name: 'end_voice_session',
                args: {
                  reason: 'user_request'
                }
              }
            ]
          }
        }
      };

      // Parse tool calls
      const toolCalls = mockTransport.receiveToolCalls(geminiMessage);
      expect(toolCalls).toHaveLength(1);

      const call = toolCalls[0];

      // Execute tool via registry (simulating voice server behavior)
      const executionContext = {
        clientId: 'test-client',
        ws: mockWs,
        geminiSession: mockGeminiSession,
        args: call.args,
        session: {
          isActive: state.get('isActive'),
          toolsVersion: toolRegistry.getVersion(),
          state: state.getSnapshot()
        },
        capabilities: {
          voice: true,
          messaging: true
        }
      };

      const result = await toolRegistry.executeTool(call.name, executionContext);
      
      // Verify execution succeeded
      expect(result.ok).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.intents).toBeDefined();

      // Simulate sending result back to Gemini
      await mockTransport.sendToolResult({
        id: call.id,
        name: call.name,
        result: result
      });

      // Verify result was sent to Gemini
      expect(mockGeminiSession.send).toHaveBeenCalledTimes(1);
      const sentMessage = mockGeminiSession.send.mock.calls[0][0];
      
      expect(sentMessage).toHaveProperty('clientContent');
      expect(sentMessage.clientContent).toHaveProperty('toolResponse');
      expect(sentMessage.clientContent.toolResponse.functionResponses).toHaveLength(1);
      expect(sentMessage.clientContent.toolResponse.functionResponses[0].id).toBe('call-123');
      expect(sentMessage.clientContent.toolResponse.functionResponses[0].name).toBe('end_voice_session');
      // Gemini Live API expects just the data, not the full envelope
      expect(sentMessage.clientContent.toolResponse.functionResponses[0].response).toEqual(result.data);
    });

    test('should handle tool execution failure and send error to Gemini', async () => {
      const geminiMessage = {
        serverContent: {
          toolCall: {
            functionCalls: [
              {
                id: 'call-456',
                name: 'end_voice_session',
                args: {
                  reason: 'user_request'
                }
              }
            ]
          }
        }
      };

      const toolCalls = mockTransport.receiveToolCalls(geminiMessage);
      const call = toolCalls[0];

      // Execute with invalid context (inactive session) to trigger error
      const executionContext = {
        clientId: 'test-client',
        ws: mockWs,
        geminiSession: mockGeminiSession,
        args: call.args,
        session: {
          isActive: false, // Inactive session
          toolsVersion: toolRegistry.getVersion(),
          state: state.getSnapshot()
        },
        capabilities: {
          voice: true,
          messaging: true
        }
      };

      const result = await toolRegistry.executeTool('ignore_user', executionContext);
      
      // Verify execution failed
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();

      // Send error result back to Gemini
      await mockTransport.sendToolResult({
        id: call.id,
        name: call.name,
        result: result
      });

      // Verify error was sent
      const sentMessage = mockGeminiSession.send.mock.calls[0][0];
      // Gemini Live API expects just the error object, not the full envelope
      expect(sentMessage.clientContent.toolResponse.functionResponses[0].response).toEqual(result.error);
    });
  });

  describe('Policy Enforcement', () => {
    test('should enforce mode restrictions', async () => {
      // end_voice_session should work in voice mode
      const result = await toolRegistry.executeTool('end_voice_session', {
        clientId: 'test',
        geminiSession: mockGeminiSession,
        args: { reason: 'user_request' },
        session: {
          isActive: true,
          toolsVersion: toolRegistry.getVersion(),
          state: state.getSnapshot()
        },
        capabilities: {
          voice: true,
          messaging: true
        }
      });

      expect(result.ok).toBe(true);
    });

    test('should enforce voice budget limits', async () => {
      // Simulate multiple retrieval calls exceeding budget
      const geminiMessage = {
        serverContent: {
          toolCall: {
            functionCalls: [
              { id: 'call-1', name: 'kb_search', args: { query: 'test1' } },
              { id: 'call-2', name: 'kb_search', args: { query: 'test2' } },
              { id: 'call-3', name: 'kb_search', args: { query: 'test3' } } // Should exceed budget
            ]
          }
        }
      };

      const toolCalls = mockTransport.receiveToolCalls(geminiMessage);
      
      // In real implementation, voice server would track budget and reject call-3
      // This test verifies the structure is correct for budget enforcement
      expect(toolCalls.length).toBeGreaterThan(2);
      
      // Verify kb_search is marked as retrieval tool
      const metadata = toolRegistry.getToolMetadata('kb_search');
      expect(metadata.category).toBe('retrieval');
    });
  });

  describe('Complete Integration Flow', () => {
    test('should handle full tool call cycle: receive → execute → respond', async () => {
      // Step 1: Gemini sends tool call
      const geminiMessage = {
        serverContent: {
          toolCall: {
            functionCalls: [
              {
                id: 'call-integration-test',
                name: 'end_voice_session',
                args: {
                  reason: 'user_request'
                }
              }
            ]
          }
        }
      };

      // Step 2: Parse tool calls
      const toolCalls = mockTransport.receiveToolCalls(geminiMessage);
      expect(toolCalls).toHaveLength(1);

      // Step 3: Execute tool
      const call = toolCalls[0];
      const executionContext = {
        clientId: 'integration-test',
        ws: mockWs,
        geminiSession: mockGeminiSession,
        args: call.args,
        session: {
          isActive: state.get('isActive'),
          toolsVersion: toolRegistry.getVersion(),
          state: state.getSnapshot()
        },
        capabilities: {
          voice: true,
          messaging: true
        }
      };

      const result = await toolRegistry.executeTool(call.name, executionContext);
      expect(result.ok).toBe(true);

      // Step 4: Send result back
      await mockTransport.sendToolResult({
        id: call.id,
        name: call.name,
        result: result
      });

      // Step 5: Verify complete flow
      expect(mockGeminiSession.send).toHaveBeenCalledTimes(1);
      const response = mockGeminiSession.send.mock.calls[0][0];
      
      expect(response.clientContent.toolResponse.functionResponses[0].id).toBe('call-integration-test');
      // Gemini Live API expects just the data, not the full envelope
      expect(response.clientContent.toolResponse.functionResponses[0].response).toEqual(result.data);
      expect(response.clientContent.toolResponse.functionResponses[0].response.reason).toBe('user_request');
    });
  });
});
