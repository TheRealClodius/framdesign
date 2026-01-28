/**
 * Tool Registry Watcher
 * 
 * Watches tools/ directory for changes and runs tool-builder.js
 */

import { watch } from 'fs';
import { exec } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOOLS_DIR = join(__dirname, '..');
const BUILDER_PATH = join(__dirname, 'tool-builder.js');

console.log(`👁️  Watching tools in ${TOOLS_DIR} for changes...`);

let debounceTimer;

// Watch recursively (if supported by OS)
const watcher = watch(TOOLS_DIR, { recursive: true }, (event, filename) => {
  // Ignore tool_registry.json, _core, _build, and dotfiles
  if (
    !filename || 
    filename === 'tool_registry.json' || 
    filename.startsWith('_') || 
    filename.startsWith('.') ||
    filename.includes('/_') ||
    filename.includes('/.')
  ) {
    return;
  }

  // Only watch relevant files
  if (!filename.endsWith('.js') && !filename.endsWith('.json') && !filename.endsWith('.md')) {
    return;
  }

  console.log(`[Watcher] Change detected in ${filename}`);

  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    console.log('[Watcher] Rebuilding tool registry...');
    exec(`"${process.execPath}" "${BUILDER_PATH}"`, (error, stdout, stderr) => {
      if (error) {
        console.error(`[Watcher] ✗ Build failed: ${error.message}`);
        return;
      }
      if (stderr) {
        console.error(`[Watcher] ⚠ Build warning:\n${stderr}`);
      }
      console.log(stdout || '[Watcher] ✓ Tool registry rebuilt');
    });
  }, 200);
});

process.on('SIGINT', () => {
  watcher.close();
  process.exit(0);
});
