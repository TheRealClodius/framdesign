/**
 * Unit tests for registry.js
 *
 * Uses direct registry population instead of mocking load() internals,
 * since load() relies on both dynamic import() and readFileSync which
 * are difficult to mock together in Jest ESM mode.
 */

import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import { ToolRegistry } from '../../../tools/_core/registry.js';
import { ErrorType, ToolError } from '../../../tools/_core/error-types.js';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

/**
 * Helper: populate a registry with test tool data (bypasses load())
 */
function populateRegistry(registry, config) {
  const { version = '1.0.0', gitCommit = 'abc123', tools = [] } = config;
  const ajv = new Ajv({ allErrors: true, useDefaults: true, coerceTypes: false, removeAdditional: false, strict: true });
  addFormats(ajv);

  registry.version = version;
  registry.gitCommit = gitCommit;

  for (const tool of tools) {
    registry.tools.set(tool.toolId, tool);
    if (tool.jsonSchema) {
      registry.validators.set(tool.toolId, ajv.compile(tool.jsonSchema));
    }
    if (tool.handler) {
      registry.handlers.set(tool.toolId, tool.handler);
    }
  }
}

describe('ToolRegistry', () => {
  let registry;

  beforeEach(() => {
    registry = new ToolRegistry();
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    test('should initialize empty registry', () => {
      expect(registry.tools.size).toBe(0);
      expect(registry.handlers.size).toBe(0);
      expect(registry.validators.size).toBe(0);
      expect(registry.version).toBe(null);
      expect(registry.gitCommit).toBe(null);
      expect(registry.locked).toBe(false);
      expect(registry.frozenSnapshot).toBe(null);
    });
  });

  describe('load', () => {
    test('should throw if registry is locked', async () => {
      registry.lock();

      await expect(registry.load()).rejects.toThrow('Cannot load registry after lock()');
    });

    test('should load the real tool_registry.json', async () => {
      // Integration-style test: loads the actual generated registry
      await registry.load();

      expect(registry.version).toBeDefined();
      expect(registry.tools.size).toBeGreaterThan(0);
      expect(registry.tools.has('kb_search')).toBe(true);
      expect(registry.handlers.has('kb_search')).toBe(true);
      expect(registry.validators.has('kb_search')).toBe(true);
    });
  });

  describe('getProviderSchemas', () => {
    test('should return schemas for openai', () => {
      populateRegistry(registry, {
        tools: [
          {
            toolId: 'test_tool',
            version: '1.0.0',
            category: 'utility',
            summary: 'Test tool',
            jsonSchema: { type: 'object' },
            allowedModes: ['text', 'voice'],
            providerSchemas: {
              openai: { name: 'test_tool', description: 'Test' }
            }
          }
        ]
      });

      const schemas = registry.getProviderSchemas('openai');

      expect(schemas).toHaveLength(1);
      expect(schemas[0]).toEqual({ name: 'test_tool', description: 'Test' });
    });

    test('should throw for unsupported provider', () => {
      expect(() => registry.getProviderSchemas('unsupported')).toThrow('Unsupported provider: unsupported');
    });
  });

  describe('getSummaries', () => {
    test('should return formatted summaries', () => {
      populateRegistry(registry, {
        tools: [
          {
            toolId: 'tool1',
            version: '1.0.0',
            category: 'utility',
            summary: 'Tool 1 summary',
            jsonSchema: { type: 'object' },
          },
          {
            toolId: 'tool2',
            version: '1.0.0',
            category: 'action',
            summary: 'Tool 2 summary',
            jsonSchema: { type: 'object' },
          }
        ]
      });

      const summaries = registry.getSummaries();

      expect(summaries).toContain('**tool1** (utility): Tool 1 summary');
      expect(summaries).toContain('**tool2** (action): Tool 2 summary');
    });
  });

  describe('getDocumentation', () => {
    test('should return documentation for tool', () => {
      populateRegistry(registry, {
        tools: [
          {
            toolId: 'test_tool',
            version: '1.0.0',
            category: 'utility',
            summary: 'Test tool',
            documentation: '# Test Tool\n\nDocumentation here',
            jsonSchema: { type: 'object' },
          }
        ]
      });

      const doc = registry.getDocumentation('test_tool');

      expect(doc).toBe('# Test Tool\n\nDocumentation here');
    });

    test('should return null for non-existent tool', () => {
      expect(registry.getDocumentation('nonexistent')).toBe(null);
    });
  });

  describe('getToolMetadata', () => {
    test('should return metadata for tool', () => {
      populateRegistry(registry, {
        tools: [
          {
            toolId: 'test_tool',
            version: '1.0.0',
            category: 'utility',
            summary: 'Test tool',
            sideEffects: 'read_only',
            idempotent: true,
            requiresConfirmation: false,
            allowedModes: ['voice', 'text'],
            latencyBudgetMs: 1000,
            jsonSchema: { type: 'object' },
          }
        ]
      });

      const metadata = registry.getToolMetadata('test_tool');

      expect(metadata).toEqual({
        toolId: 'test_tool',
        version: '1.0.0',
        category: 'utility',
        sideEffects: 'read_only',
        idempotent: true,
        requiresConfirmation: false,
        allowedModes: ['voice', 'text'],
        latencyBudgetMs: 1000
      });
    });

    test('should return null for non-existent tool', () => {
      expect(registry.getToolMetadata('nonexistent')).toBe(null);
    });
  });

  describe('executeTool', () => {
    let mockHandler;

    beforeEach(() => {
      mockHandler = jest.fn();

      populateRegistry(registry, {
        tools: [
          {
            toolId: 'test_tool',
            version: '1.0.0',
            category: 'utility',
            summary: 'Test tool',
            jsonSchema: {
              type: 'object',
              properties: {
                param: { type: 'string' }
              },
              required: []
            },
            handler: mockHandler
          }
        ]
      });
    });

    test('should return NOT_FOUND for non-existent tool', async () => {
      const result = await registry.executeTool('nonexistent', {
        args: {}
      });

      expect(result.ok).toBe(false);
      expect(result.error.type).toBe(ErrorType.NOT_FOUND);
      expect(result.error.message).toContain('not found');
      expect(result.error.retryable).toBe(false);
    });

    test('should return VALIDATION error for invalid parameters', async () => {
      const result = await registry.executeTool('test_tool', {
        args: { param: 123 } // Should be string
      });

      expect(result.ok).toBe(false);
      expect(result.error.type).toBe(ErrorType.VALIDATION);
      expect(result.error.retryable).toBe(false);
    });

    test('should execute tool successfully', async () => {
      mockHandler.mockResolvedValue({
        ok: true,
        data: { result: 'success' },
        meta: {}
      });

      const result = await registry.executeTool('test_tool', {
        clientId: 'test123',
        args: { param: 'value' }
      });

      expect(result.ok).toBe(true);
      expect(result.data.result).toBe('success');
      expect(result.meta.toolId).toBe('test_tool');
      expect(result.meta.toolVersion).toBe('1.0.0');
      expect(result.meta.registryVersion).toBe('1.0.0');
      expect(result.meta.duration).toBeGreaterThanOrEqual(0);
      expect(mockHandler).toHaveBeenCalled();
    });

    test('should handle ToolError from handler', async () => {
      mockHandler.mockRejectedValue(
        new ToolError(ErrorType.TRANSIENT, 'Network error', {
          retryable: true
        })
      );

      const result = await registry.executeTool('test_tool', {
        args: { param: 'value' }
      });

      expect(result.ok).toBe(false);
      expect(result.error.type).toBe(ErrorType.TRANSIENT);
      expect(result.error.message).toBe('Network error');
      expect(result.error.retryable).toBe(true);
    });

    test('should handle unexpected errors from handler', async () => {
      mockHandler.mockRejectedValue(new Error('Unexpected error'));

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await registry.executeTool('test_tool', {
        args: { param: 'value' }
      });

      expect(result.ok).toBe(false);
      expect(result.error.type).toBe(ErrorType.INTERNAL);
      expect(result.error.message).toContain('Unexpected error');
      expect(result.error.retryable).toBe(false);
      expect(result.error.partialSideEffects).toBe(true);
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    test('should return INTERNAL error for invalid response structure', async () => {
      // ok must be a boolean - returning string triggers validation error
      mockHandler.mockResolvedValue({
        ok: 'yes',
        data: {}
      });

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await registry.executeTool('test_tool', {
        args: { param: 'value' }
      });

      expect(result.ok).toBe(false);
      expect(result.error.type).toBe(ErrorType.INTERNAL);
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    test('should add metadata to response', async () => {
      mockHandler.mockResolvedValue({
        ok: true,
        data: { result: 'success' },
        meta: { custom: 'value' }
      });

      const result = await registry.executeTool('test_tool', {
        args: { param: 'value' }
      });

      expect(result.meta.toolId).toBe('test_tool');
      expect(result.meta.toolVersion).toBe('1.0.0');
      expect(result.meta.registryVersion).toBe('1.0.0');
      expect(result.meta.custom).toBe('value'); // Preserve existing meta
      expect(result.meta.duration).toBeDefined();
    });
  });

  describe('lock and snapshot', () => {
    test('should lock registry', () => {
      populateRegistry(registry, {
        tools: [
          {
            toolId: 'test_tool',
            version: '1.0.0',
            category: 'utility',
            summary: 'Test tool',
            jsonSchema: { type: 'object' },
          }
        ]
      });

      registry.lock();

      expect(registry.locked).toBe(true);
      expect(registry.frozenSnapshot).toBeDefined();
      expect(registry.frozenSnapshot.version).toBe('1.0.0');
      expect(registry.frozenSnapshot.gitCommit).toBe('abc123');
      expect(registry.frozenSnapshot.toolIds).toContain('test_tool');
    });

    test('should allow multiple lock calls', () => {
      registry.lock();
      expect(() => registry.lock()).not.toThrow();
    });

    test('should throw if snapshotting unlocked registry', () => {
      expect(() => registry.snapshot()).toThrow('Cannot snapshot unlocked registry');
    });

    test('should return snapshot after locking', () => {
      populateRegistry(registry, {
        tools: [
          {
            toolId: 'test_tool',
            version: '1.0.0',
            category: 'utility',
            summary: 'Test tool',
            jsonSchema: { type: 'object' },
          }
        ]
      });

      registry.lock();

      const snapshot = registry.snapshot();
      expect(snapshot).toBeDefined();
      expect(snapshot.version).toBe('1.0.0');
      expect(snapshot.toolIds).toEqual(['test_tool']);
    });
  });

  describe('getVersion and getGitCommit', () => {
    test('should return version and commit', () => {
      populateRegistry(registry, {
        version: '1.0.0',
        gitCommit: 'abc123',
        tools: []
      });

      expect(registry.getVersion()).toBe('1.0.0');
      expect(registry.getGitCommit()).toBe('abc123');
    });
  });

  describe('filterArgsBySchema', () => {
    test('should filter out extra properties not in schema', () => {
      const schema = {
        type: 'object',
        additionalProperties: false,
        properties: {
          query: { type: 'string' },
          top_k: { type: 'number' }
        }
      };

      const args = {
        query: 'test',
        top_k: 5,
        extra_prop: 'should be removed',
        another_extra: 123
      };

      const filtered = registry.filterArgsBySchema(args, schema, 'test_tool');

      expect(filtered).toEqual({
        query: 'test',
        top_k: 5
      });
      expect(filtered.extra_prop).toBeUndefined();
      expect(filtered.another_extra).toBeUndefined();
    });

    test('should handle nested objects with filters', () => {
      const schema = {
        type: 'object',
        additionalProperties: false,
        properties: {
          query: { type: 'string' },
          filters: {
            type: 'object',
            additionalProperties: false,
            properties: {
              type: { type: 'string' }
            }
          }
        }
      };

      const args = {
        query: 'test',
        filters: {
          type: 'person',
          extra_nested: 'should be removed'
        },
        extra_top: 'should be removed'
      };

      const filtered = registry.filterArgsBySchema(args, schema, 'test_tool');

      expect(filtered).toEqual({
        query: 'test',
        filters: {
          type: 'person'
        }
      });
      expect(filtered.filters.extra_nested).toBeUndefined();
      expect(filtered.extra_top).toBeUndefined();
    });

    test('should preserve arrays and primitives', () => {
      const schema = {
        type: 'object',
        additionalProperties: false,
        properties: {
          query: { type: 'string' },
          tags: { type: 'array' },
          count: { type: 'number' }
        }
      };

      const args = {
        query: 'test',
        tags: ['tag1', 'tag2'],
        count: 42,
        extra: 'remove'
      };

      const filtered = registry.filterArgsBySchema(args, schema);

      expect(filtered.query).toBe('test');
      expect(filtered.tags).toEqual(['tag1', 'tag2']);
      expect(filtered.count).toBe(42);
      expect(filtered.extra).toBeUndefined();
    });

    test('should handle null and undefined values', () => {
      const schema = {
        type: 'object',
        additionalProperties: false,
        properties: {
          query: { type: 'string' }
        }
      };

      expect(registry.filterArgsBySchema(null, schema)).toEqual({});
      expect(registry.filterArgsBySchema(undefined, schema)).toEqual({});
      expect(registry.filterArgsBySchema({}, schema)).toEqual({});
    });

    test('should return original args if schema has no properties', () => {
      const schema = { type: 'object' };
      const args = { query: 'test' };

      const filtered = registry.filterArgsBySchema(args, schema);
      expect(filtered).toEqual(args);
    });
  });
});
