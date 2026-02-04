import { describe, test, expect } from '@jest/globals';
import { readdirSync, statSync, readFileSync } from 'fs';
import { join } from 'path';
import { HANDLER_IMPORTS } from '../../tools/_core/registry.js';

const toolsDir = join(process.cwd(), 'tools');

function getToolDirs() {
  return readdirSync(toolsDir)
    .filter((name) => {
      const fullPath = join(toolsDir, name);
      if (!statSync(fullPath).isDirectory()) return false;
      return !['_core', '_build'].includes(name);
    });
}

describe('Tool registry consistency', () => {
  test('tool directories match registry and handler map', () => {
    const toolDirs = getToolDirs();
    const expectedToolIds = toolDirs
      .map((dir) => dir.replace(/-/g, '_'))
      .sort();

    const registry = JSON.parse(
      readFileSync(join(toolsDir, 'tool_registry.json'), 'utf-8')
    );
    const registryIds = registry.tools.map((tool) => tool.toolId).sort();

    const handlerIds = Object.keys(HANDLER_IMPORTS).sort();

    expect(registryIds).toEqual(expectedToolIds);
    expect(handlerIds).toEqual(expectedToolIds);
  });
});
