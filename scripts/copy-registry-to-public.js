import { copyFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');
const src = join(projectRoot, 'tools', 'tool_registry.json');
const dest = join(projectRoot, 'public', 'tools', 'tool_registry.json');

if (existsSync(src)) {
  const destDir = dirname(dest);
  if (!existsSync(destDir)) {
    mkdirSync(destDir, { recursive: true });
  }
  copyFileSync(src, dest);
  console.log('✓ Copied tool_registry.json to public/tools/');
} else {
  console.error('✗ tool_registry.json not found at', src);
  process.exit(1);
}
