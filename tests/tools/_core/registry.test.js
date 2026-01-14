/**
 * Unit-ish tests for registry.js
 *
 * NOTE:
 * The registry implementation is ESM + uses dynamic imports. Jest ESM mocking is
 * significantly more complex than CJS mocking. These tests intentionally validate
 * behavior against the real generated registry artifact instead of attempting to
 * mock `fs` + `import()` calls.
 */

import { ToolRegistry } from '../../../tools/_core/registry.js';
import { ErrorType } from '../../../tools/_core/error-types.js';

describe('ToolRegistry', () => {
  let registry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  test('should initialize empty registry', () => {
    expect(registry.tools.size).toBe(0);
    expect(registry.handlers.size).toBe(0);
    expect(registry.validators.size).toBe(0);
    expect(registry.version).toBe(null);
    expect(registry.gitCommit).toBe(null);
    expect(registry.locked).toBe(false);
  });

  test('should load the generated registry artifact', async () => {
    await registry.load();
    expect(typeof registry.getVersion()).toBe('string');
    expect(registry.tools.size).toBeGreaterThan(0);
    expect(registry.tools.has('ignore_user')).toBe(true);
    expect(registry.handlers.has('ignore_user')).toBe(true);
  });

  test('should throw if registry is locked', async () => {
    await registry.load();
    registry.lock();
    await expect(registry.load()).rejects.toThrow('Cannot load registry after lock()');
  });

  test('should throw for unsupported provider schemas', async () => {
    await registry.load();
    expect(() => registry.getProviderSchemas('unsupported')).toThrow('Unsupported provider: unsupported');
  });

  test('should return tool metadata for known tool', async () => {
    await registry.load();
    const md = registry.getToolMetadata('ignore_user');
    expect(md).toBeTruthy();
    expect(md.toolId).toBe('ignore_user');
  });

  test('should execute known tool (ignore_user) successfully', async () => {
    await registry.load();
    const result = await registry.executeTool('ignore_user', {
      clientId: 'test',
      args: { duration_seconds: 60, farewell_message: 'Goodbye. Take care.' },
      session: { isActive: true },
      capabilities: { voice: false, messaging: false },
    });

    expect(result.ok).toBe(true);
    expect(result.data.durationSeconds).toBe(60);
  });

  test('should return NOT_FOUND for unknown tool', async () => {
    await registry.load();
    const result = await registry.executeTool('does_not_exist', { args: {} });
    expect(result.ok).toBe(false);
    expect(result.error.type).toBe(ErrorType.NOT_FOUND);
  });
});
