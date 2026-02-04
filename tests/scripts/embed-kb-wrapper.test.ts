import { describe, test, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('Embed KB wrapper', () => {
  test('scripts/Embed/embed-kb.ts is a thin wrapper', () => {
    const filePath = join(process.cwd(), 'scripts', 'Embed', 'embed-kb.ts');
    const content = readFileSync(filePath, 'utf-8');

    expect(content).toMatch(/import\s+['"]\.\.\/embed-kb['"]/);
    expect(content.split('\n').length).toBeLessThan(20);
  });
});
