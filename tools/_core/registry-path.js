/**
 * Registry path helper - ensures webpack traces the tool_registry.json file
 * This file exists solely to help Next.js file tracing detect the dependency
 */

import { join } from 'path';
import { existsSync } from 'fs';

// Explicitly reference the registry file path to help static analysis
// This makes the file dependency obvious to webpack/Next.js file tracing
export function getRegistryPath() {
  const projectRoot = process.cwd() || require('path').resolve(__dirname, '..', '..');
  const paths = [
    join(projectRoot, 'tools', 'tool_registry.json'),
    join(__dirname, '..', 'tool_registry.json'),
  ];
  
  // Return the first path that exists, or the first one as fallback
  return paths.find(p => existsSync(p)) || paths[0];
}

// Export the path as a constant string to help static analysis
export const REGISTRY_FILE_PATH = 'tools/tool_registry.json';
