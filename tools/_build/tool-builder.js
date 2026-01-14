/**
 * Tool Registry Builder
 *
 * Scans tools/ directories and generates tool_registry.json
 *
 * Build process:
 * 1. Scan tools/ for directories (ignore _core, _build)
 * 2. For each tool directory:
 *    - Read schema.json
 *    - Validate schema structure and JSON Schema syntax
 *    - Read doc_summary.md and doc.md
 *    - Validate documentation structure
 *    - Verify handler.js exists
 * 3. Generate tool_registry.json with:
 *    - Content-based version hash
 *    - Git commit
 *    - Build timestamp
 *    - Tool metadata with canonical JSON Schema
 */

import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createHash } from 'crypto';
import { execSync } from 'child_process';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOOLS_DIR = join(__dirname, '..');
const OUTPUT_FILE = join(TOOLS_DIR, 'tool_registry.json');

/**
 * Required sections in doc.md
 */
const REQUIRED_DOC_SECTIONS = [
  '## Summary',
  '## Preconditions',
  '## Postconditions',
  '## Invariants',
  '## Failure Modes',
  '## Examples',
  '## Common Mistakes'
];

/**
 * Configure Ajv validator
 */
const ajv = new Ajv({
  allErrors: true,
  useDefaults: true,
  coerceTypes: false,
  removeAdditional: false,
  strict: true
});
addFormats(ajv);

/**
 * Check if file exists
 */
function checkFileExists(path) {
  return existsSync(path);
}

/**
 * Get current git commit hash
 */
function getGitCommit() {
  try {
    const commit = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
    return commit;
  } catch (error) {
    return 'unknown';
  }
}

/**
 * Canonical JSON stringify for stable hashing
 */
function canonicalStringify(obj) {
  if (obj === null) return 'null';
  if (typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalStringify).join(',') + ']';
  }
  const keys = Object.keys(obj).sort();
  const pairs = keys.map(key => `"${key}":${canonicalStringify(obj[key])}`);
  return '{' + pairs.join(',') + '}';
}

/**
 * Generate content-based version hash
 */
function generateRegistryVersion(tools) {
  const content = tools.map(t => ({
    toolId: t.toolId,
    version: t.version,
    schema: t.jsonSchema,
    summary: t.summary
  }));

  const hash = createHash('sha256')
    .update(canonicalStringify(content))
    .digest('hex')
    .substring(0, 8);

  return `1.0.${hash}`;
}

/**
 * Validate documentation structure
 */
function lintDocumentation(doc, toolDirName) {
  for (const section of REQUIRED_DOC_SECTIONS) {
    if (!doc.includes(section)) {
      throw new Error(`Tool ${toolDirName}: Missing required section "${section}" in doc.md`);
    }
  }
  return true;
}

/**
 * Validate schema structure
 */
function lintSchema(schema, toolDirName) {
  // Check required top-level fields
  const requiredFields = ['toolId', 'version', 'category', 'description', 'parameters', 'sideEffects', 'idempotent', 'requiresConfirmation', 'allowedModes', 'latencyBudgetMs'];

  for (const field of requiredFields) {
    if (!(field in schema)) {
      throw new Error(`Tool ${toolDirName}: Missing required field "${field}" in schema.json`);
    }
  }

  // Validate category
  const validCategories = ['retrieval', 'action', 'utility'];
  if (!validCategories.includes(schema.category)) {
    throw new Error(`Tool ${toolDirName}: Invalid category "${schema.category}". Must be one of: ${validCategories.join(', ')}`);
  }

  // Validate allowedModes
  if (!Array.isArray(schema.allowedModes) || schema.allowedModes.length === 0) {
    throw new Error(`Tool ${toolDirName}: allowedModes must be a non-empty array`);
  }

  // Validate toolId matches directory name (with dash->underscore)
  const expectedToolId = toolDirName.replace(/-/g, '_');
  if (schema.toolId !== expectedToolId) {
    throw new Error(`Tool ${toolDirName}: toolId "${schema.toolId}" doesn't match directory name (expected "${expectedToolId}")`);
  }

  // Validate parameters is object
  if (typeof schema.parameters !== 'object' || schema.parameters === null) {
    throw new Error(`Tool ${toolDirName}: parameters must be an object`);
  }

  // Check additionalProperties: false
  if (schema.parameters.additionalProperties !== false) {
    throw new Error(`Tool ${toolDirName}: parameters must have "additionalProperties: false"`);
  }

  // Validate parameters with Ajv
  try {
    ajv.compile(schema.parameters);
  } catch (error) {
    throw new Error(`Tool ${toolDirName}: Invalid JSON Schema in parameters: ${error.message}`);
  }

  return true;
}

/**
 * Build a single tool
 */
function buildTool(toolDirName) {
  const toolDir = join(TOOLS_DIR, toolDirName);

  console.log(`  Building ${toolDirName}...`);

  // Check required files
  const schemaPath = join(toolDir, 'schema.json');
  const docSummaryPath = join(toolDir, 'doc_summary.md');
  const docPath = join(toolDir, 'doc.md');
  const handlerPath = join(toolDir, 'handler.js');

  if (!checkFileExists(schemaPath)) {
    throw new Error(`Tool ${toolDirName}: Missing schema.json`);
  }
  if (!checkFileExists(docSummaryPath)) {
    throw new Error(`Tool ${toolDirName}: Missing doc_summary.md`);
  }
  if (!checkFileExists(docPath)) {
    throw new Error(`Tool ${toolDirName}: Missing doc.md`);
  }
  if (!checkFileExists(handlerPath)) {
    throw new Error(`Tool ${toolDirName}: Missing handler.js`);
  }

  // Read files
  const schemaJson = readFileSync(schemaPath, 'utf-8');
  const schema = JSON.parse(schemaJson);
  const docSummary = readFileSync(docSummaryPath, 'utf-8').trim();
  const doc = readFileSync(docPath, 'utf-8');

  // Validate schema
  lintSchema(schema, toolDirName);

  // Validate doc_summary length
  if (docSummary.length > 250) {
    throw new Error(`Tool ${toolDirName}: doc_summary.md too long (${docSummary.length} chars, max 250)`);
  }

  // Validate documentation structure
  lintDocumentation(doc, toolDirName);

  // Build tool definition with JSON Schema
  const toolDefinition = {
    toolId: schema.toolId,
    version: schema.version,
    category: schema.category,
    description: schema.description,
    sideEffects: schema.sideEffects,
    idempotent: schema.idempotent,
    requiresConfirmation: schema.requiresConfirmation,
    allowedModes: schema.allowedModes,
    latencyBudgetMs: schema.latencyBudgetMs,
    jsonSchema: schema.parameters,
    summary: docSummary,
    documentation: doc,
    handlerPath: pathToFileURL(handlerPath).href
  };

  return {
    ...toolDefinition
  };
}

/**
 * Main build function
 */
function buildRegistry() {
  console.log('🔨 Building tool registry...\n');

  try {
    // Scan tools directory
    const entries = readdirSync(TOOLS_DIR);
    const toolDirs = entries.filter(name => {
      // Ignore special directories and hidden files
      if (name.startsWith('_') || name.startsWith('.')) return false;

      // Only include directories
      const fullPath = join(TOOLS_DIR, name);
      return statSync(fullPath).isDirectory();
    });

    if (toolDirs.length === 0) {
      console.log('⚠️  No tool directories found in tools/');
      console.log('   Create tool directories with schema.json, doc_summary.md, doc.md, and handler.js');
      console.log('   See tools/README.md for authoring guide\n');

      // Create empty registry
      const registry = {
        version: '1.0.00000000',
        gitCommit: getGitCommit(),
        buildTimestamp: new Date().toISOString(),
        tools: []
      };

      writeFileSync(OUTPUT_FILE, JSON.stringify(registry, null, 2));
      console.log(`✓ Empty registry written to ${OUTPUT_FILE}`);
      console.log(`  Version: ${registry.version}`);
      console.log(`  Git commit: ${registry.gitCommit}\n`);
      return;
    }

    // Build each tool
    const tools = [];
    for (const toolDir of toolDirs) {
      try {
        const tool = buildTool(toolDir);
        tools.push(tool);
      } catch (error) {
        console.error(`\n❌ Error building tool ${toolDir}:`);
        console.error(`   ${error.message}\n`);
        process.exit(1);
      }
    }

    // Generate registry version
    const version = generateRegistryVersion(tools);
    const gitCommit = getGitCommit();
    const buildTimestamp = new Date().toISOString();

    // Build registry
    const registry = {
      version,
      gitCommit,
      buildTimestamp,
      tools
    };

    // Write output
    writeFileSync(OUTPUT_FILE, JSON.stringify(registry, null, 2));

    console.log(`\n✓ Tool registry built successfully!`);
    console.log(`  Version: ${version}`);
    console.log(`  Git commit: ${gitCommit}`);
    console.log(`  Tools: ${tools.length}`);
    console.log(`  Output: ${OUTPUT_FILE}\n`);

  } catch (error) {
    console.error(`\n❌ Build failed: ${error.message}\n`);
    process.exit(1);
  }
}

buildRegistry();
