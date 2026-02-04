import { describe, test, expect } from '@jest/globals';
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';

describe('Repo hygiene', () => {
  test('no committed artifacts', () => {
    const root = process.cwd();
    const forbidden = [
      'vector-search-api',
      'debug.log',
      'chunks_debug.json',
      'test-results.json'
    ];

    for (const entry of forbidden) {
      expect(existsSync(join(root, entry))).toBe(false);
    }

    const logs = readdirSync(root).filter(
      (name) => name.startsWith('test-output') && name.endsWith('.log')
    );
    expect(logs).toEqual([]);
  });
});
