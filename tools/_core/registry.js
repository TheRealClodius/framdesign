/**
 * Tool Registry - Runtime Loader
 *
 * Loads tool_registry.json at startup and provides:
 * - Tool execution with validation
 * - Provider-specific schema access (pre-computed at build time)
 * - Tool metadata for orchestrator policy enforcement
 * - Documentation access (summaries + full docs)
 *
 * ARCHITECTURE: Provider-agnostic runtime
 * - Stores canonical JSON Schema (for validation)
 * - Stores pre-computed provider schemas (from build step)
 * - NO runtime schema conversion
 * - NO provider SDK imports (Type.* enums, etc.)
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { ErrorType, ToolError } from './error-types.js';
import { validateToolResponse, TOOL_RESPONSE_SCHEMA_VERSION } from './tool-response.js';
import { recordToolExecution, recordError, recordBudgetViolation, recordRegistryLoadTime } from './metrics.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_REGISTRY_PATH = join(__dirname, '..', 'tool_registry.json');
// Create require function for resolving modules  
const require = createRequire(import.meta.url);
// Project root is two levels up from _core
const PROJECT_ROOT = resolve(__dirname, '..', '..');

function resolveRegistryPath() {
  const envPath = process.env.TOOL_REGISTRY_PATH;

  // In Next.js serverless, `__dirname` may point into a compiled chunk directory.
  // `process.cwd()` is typically the deployed bundle root (e.g., /var/task on Vercel).
  const candidates = [
    envPath,
    join(process.cwd(), 'tools', 'tool_registry.json'),
    join(PROJECT_ROOT, 'tools', 'tool_registry.json'),
    DEFAULT_REGISTRY_PATH,
  ].filter(Boolean);

  for (const p of candidates) {
    try {
      if (existsSync(p)) return p;
    } catch {
      // ignore
    }
  }

  const details = [
    `cwd=${process.cwd()}`,
    `__dirname=${__dirname}`,
    `PROJECT_ROOT=${PROJECT_ROOT}`,
    `DEFAULT_REGISTRY_PATH=${DEFAULT_REGISTRY_PATH}`,
    `TOOL_REGISTRY_PATH=${envPath || ''}`,
    `candidates=${candidates.join(',')}`,
  ].join(' | ');

  throw new Error(`tool_registry.json not found (${details})`);
}

// Static import map for Webpack compatibility
// Webpack can statically analyze these imports at build time
const HANDLER_IMPORTS = {
  'end_voice_session': () => import('../end-voice-session/handler.js'),
  'ignore_user': () => import('../ignore-user/handler.js'),
  'kb_get': () => import('../kb-get/handler.js'),
  'kb_search': () => import('../kb-search/handler.js'),
  'start_voice_session': () => import('../start-voice-session/handler.js'),
};

/**
 * ToolRegistry class
 *
 * Singleton instance exported as `toolRegistry`
 */
export class ToolRegistry {
  constructor() {
    this.tools = new Map();           // toolId -> tool metadata
    this.handlers = new Map();        // toolId -> handler function
    this.validators = new Map();      // toolId -> Ajv validator
    this.version = null;              // Registry version
    this.gitCommit = null;            // Git commit at build time
    this.locked = false;              // Lock after load (no hot reload)
    this.frozenSnapshot = null;       // Immutable snapshot for sessions
  }

  /**
   * Load registry at startup
   *
   * Reads tool_registry.json, compiles validators, imports handlers
   */
  async load() {
    if (this.locked) {
      throw new Error('Cannot load registry after lock()');
    }

    console.log('Loading tool registry...');
    const loadStartTime = Date.now();

    // Read registry file (robust path resolution for serverless deploys)
    const registryPath = resolveRegistryPath();
    console.log(`[Registry] Using registry file: ${registryPath}`);
    const registryJson = readFileSync(registryPath, 'utf-8');
    const registry = JSON.parse(registryJson);

    this.version = registry.version;
    this.gitCommit = registry.gitCommit;

    // Create Ajv instance for validation
    const ajv = new Ajv({
      allErrors: true,
      useDefaults: true,
      coerceTypes: false,
      removeAdditional: false,
      strict: true
    });
    addFormats(ajv);

    // Load each tool
    for (const tool of registry.tools) {
      // Store tool metadata
      this.tools.set(tool.toolId, tool);

      // Compile validator
      try {
        const validator = ajv.compile(tool.jsonSchema);
        this.validators.set(tool.toolId, validator);
      } catch (error) {
        throw new Error(`Failed to compile validator for ${tool.toolId}: ${error.message}`);
      }

      // Dynamic import handler
      let importPath = tool.handlerPath;
      try {
        let handlerModule;
        
        // Check if we have a static import map entry (for Webpack compatibility)
        if (HANDLER_IMPORTS[tool.toolId]) {
          // Use static import map - Webpack can analyze these at build time
          console.log(`[Registry] Loading ${tool.toolId} from static import map`);
          handlerModule = await HANDLER_IMPORTS[tool.toolId]();
        } else {
          // Fallback: dynamic import with path resolution
          // Convert file:// URLs to file paths for webpack compatibility
          if (importPath.startsWith('file://')) {
            const url = new URL(importPath);
            let filePath = url.pathname;
            
            // Handle macOS/Unix paths (file:///Users/...) vs Windows paths
            if (process.platform === 'win32' && filePath.startsWith('/')) {
              filePath = filePath.substring(1);
            }
            
            // Extract tool name from path (e.g., /Users/.../tools/end-voice-session/handler.js -> end-voice-session)
            const toolsMatch = filePath.match(/tools[\/\\]([^\/\\]+)[\/\\]handler\.js$/);
            if (toolsMatch) {
              const toolName = toolsMatch[1];
              // Use relative path from registry location
              importPath = `../${toolName}/handler.js`;
            } else {
              // Fallback: use the file path as-is
              importPath = filePath.replace(/\\/g, '/');
            }
          } else {
            // Path doesn't start with file://, ensure it uses forward slashes
            importPath = importPath.replace(/\\/g, '/');
          }
          
          // Log the resolved path for debugging
          console.log(`[Registry] Loading ${tool.toolId} from: ${importPath}`);
          
          // Use dynamic import (works in both Next.js and Node.js)
          handlerModule = await import(importPath);
        }
        
        // Debug: Log what we got from the module
        if (!handlerModule) {
          throw new Error(`Handler module ${tool.toolId} loaded but is null/undefined`);
        }
        
        if (!handlerModule.execute) {
          console.error(`[Registry] Handler module ${tool.toolId} exports:`, Object.keys(handlerModule));
          throw new Error(`Handler ${tool.toolId} must export an execute function. Found exports: ${Object.keys(handlerModule).join(', ')}`);
        }
        
        if (typeof handlerModule.execute !== 'function') {
          console.error(`[Registry] Handler ${tool.toolId} execute is not a function:`, typeof handlerModule.execute, handlerModule.execute);
          throw new Error(`Handler ${tool.toolId} execute must be a function, got ${typeof handlerModule.execute}`);
        }
        
        this.handlers.set(tool.toolId, handlerModule.execute);
      } catch (error) {
        // Log the error for debugging
        console.error(`[Registry] Failed to load ${tool.toolId}:`, error.message);
        console.error(`[Registry] Attempted path: ${importPath}`);
        throw new Error(`Failed to load handler for ${tool.toolId}: ${error.message}`);
      }
    }

    const loadDuration = Date.now() - loadStartTime;
    recordRegistryLoadTime(loadDuration);
    console.log(`✓ Tool registry loaded: v${this.version} (${this.tools.size} tools) in ${loadDuration}ms`);
  }

  /**
   * Get provider-specific schemas
   *
   * Returns pre-computed schemas from build step (NO runtime conversion)
   *
   * @param {string} provider - 'openai' or 'geminiNative'
   * @returns {Array} - Array of provider-specific tool schemas
   */
  getProviderSchemas(provider = 'openai') {
    if (provider !== 'openai' && provider !== 'geminiNative') {
      throw new Error(`Unsupported provider: ${provider}`);
    }

    const schemas = [];
    for (const tool of this.tools.values()) {
      if (tool.providerSchemas && tool.providerSchemas[provider]) {
        schemas.push(tool.providerSchemas[provider]);
      }
    }

    return schemas;
  }

  /**
   * Get tool summaries for prompt injection
   *
   * Returns formatted string with all tool summaries (2-4 lines each)
   *
   * @returns {string} - Formatted summaries
   */
  getSummaries() {
    const summaries = [];
    for (const tool of this.tools.values()) {
      summaries.push(`**${tool.toolId}** (${tool.category}): ${tool.summary}`);
    }
    return summaries.join('\n\n');
  }

  /**
   * Get full documentation for specific tool
   *
   * @param {string} toolId - Tool identifier
   * @returns {string|null} - Full markdown documentation or null if not found
   */
  getDocumentation(toolId) {
    const tool = this.tools.get(toolId);
    return tool ? tool.documentation : null;
  }

  /**
   * Get tool metadata for orchestrator policy enforcement
   *
   * @param {string} toolId - Tool identifier
   * @returns {object|null} - Metadata or null if not found
   */
  getToolMetadata(toolId) {
    const tool = this.tools.get(toolId);
    if (!tool) return null;

    return {
      toolId: tool.toolId,
      version: tool.version,
      category: tool.category,
      sideEffects: tool.sideEffects,
      idempotent: tool.idempotent,
      requiresConfirmation: tool.requiresConfirmation,
      allowedModes: tool.allowedModes,
      latencyBudgetMs: tool.latencyBudgetMs
    };
  }

  /**
   * Execute tool with validation and error handling
   *
   * @param {string} toolId - Tool identifier
   * @param {object} executionContext - Execution context
   * @returns {Promise<ToolResponse>} - Standardized response envelope
   */
  async executeTool(toolId, executionContext) {
    const startTime = Date.now();

    // Check tool exists
    if (!this.tools.has(toolId)) {
      const duration = Date.now() - startTime;
      recordToolExecution(toolId, duration, false);
      recordError(toolId, ErrorType.NOT_FOUND);
      return createResponse(toolId, false, {
        type: ErrorType.NOT_FOUND,
        message: `Tool ${toolId} not found`,
        retryable: false
      }, startTime);
    }

    const tool = this.tools.get(toolId);
    const validator = this.validators.get(toolId);
    const handler = this.handlers.get(toolId);
    
    // Debug: Check if handler exists and is a function
    if (!handler) {
      console.error(`[Registry] Handler not found for ${toolId}. Available handlers:`, Array.from(this.handlers.keys()));
      throw new Error(`Handler not found for ${toolId}`);
    }
    
    if (typeof handler !== 'function') {
      console.error(`[Registry] Handler for ${toolId} is not a function. Type: ${typeof handler}, Value:`, handler);
      throw new Error(`Handler for ${toolId} is not a function, got ${typeof handler}`);
    }

    // Validate parameters
    const valid = validator(executionContext.args || {});
    if (!valid) {
      const duration = Date.now() - startTime;
      const errors = validator.errors.map(e => `${e.instancePath} ${e.message}`).join(', ');
      recordToolExecution(toolId, duration, false);
      recordError(toolId, ErrorType.VALIDATION);
      return createResponse(toolId, false, {
        type: ErrorType.VALIDATION,
        message: `Invalid parameters: ${errors}`,
        retryable: false,
        details: validator.errors
      }, startTime);
    }

    // Build handler context
    const context = buildContext(executionContext, tool);

    // Execute handler
    try {
      const result = await handler(context);

      // Validate response structure
      try {
        validateToolResponse(result);
      } catch (validationError) {
        const duration = Date.now() - startTime;
        console.error(`[Registry] Handler ${toolId} returned invalid ToolResponse:`, validationError.message);
        recordToolExecution(toolId, duration, false);
        recordError(toolId, ErrorType.INTERNAL);
        return createResponse(toolId, false, {
          type: ErrorType.INTERNAL,
          message: `Handler returned invalid response: ${validationError.message}`,
          retryable: false
        }, startTime);
      }

      // Add metadata if missing
      if (!result.meta) {
        result.meta = {};
      }
      result.meta.toolId = toolId;
      result.meta.toolVersion = tool.version;
      result.meta.registryVersion = this.version;
      result.meta.duration = Date.now() - startTime;
      result.meta.responseSchemaVersion = TOOL_RESPONSE_SCHEMA_VERSION;

      // Record metrics
      recordToolExecution(toolId, result.meta.duration, true);
      
      // Check for budget violation
      if (result.meta.duration > tool.latencyBudgetMs) {
        recordBudgetViolation(toolId, result.meta.duration, tool.latencyBudgetMs);
      }

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Handler threw an exception
      if (error instanceof ToolError) {
        // Expected domain error
        const errorResponse = createResponse(toolId, false, {
          type: error.type,
          message: error.message,
          retryable: error.retryable,
          idempotencyRequired: error.idempotencyRequired,
          partialSideEffects: error.partialSideEffects,
          details: error.details,
          confirmation_request: error.confirmation_request
        }, startTime);
        
        // Record metrics
        recordToolExecution(toolId, duration, false);
        recordError(toolId, error.type);
        
        return errorResponse;
      } else {
        // Unexpected error
        console.error(`[Registry] Unexpected error in handler ${toolId}:`, error);
        const errorResponse = createResponse(toolId, false, {
          type: ErrorType.INTERNAL,
          message: `Unexpected error: ${error.message}`,
          retryable: false,
          partialSideEffects: true // Conservative assumption
        }, startTime);
        
        // Record metrics
        recordToolExecution(toolId, duration, false);
        recordError(toolId, ErrorType.INTERNAL);
        
        return errorResponse;
      }
    }
  }

  /**
   * Get registry version
   *
   * @returns {string} - Version string (e.g., "1.0.abc123de")
   */
  getVersion() {
    return this.version;
  }

  /**
   * Get git commit
   *
   * @returns {string|null} - Git commit hash or null
   */
  getGitCommit() {
    return this.gitCommit;
  }

  /**
   * Lock registry (prevent hot reload in production)
   */
  lock() {
    if (this.locked) {
      return; // Already locked
    }

    this.locked = true;
    this.frozenSnapshot = {
      version: this.version,
      gitCommit: this.gitCommit,
      toolIds: Array.from(this.tools.keys())
    };

    console.log(`✓ Tool registry locked (v${this.version})`);
  }

  /**
   * Get immutable snapshot for session
   *
   * @returns {object} - Frozen snapshot
   */
  snapshot() {
    if (!this.locked) {
      throw new Error('Cannot snapshot unlocked registry');
    }
    return { ...this.frozenSnapshot };
  }

  /**
   * Reload registry (DEV ONLY - fails if locked)
   */
  async reload() {
    if (this.locked) {
      throw new Error('Cannot reload locked registry');
    }

    // Clear all maps
    this.tools.clear();
    this.handlers.clear();
    this.validators.clear();
    this.version = null;
    this.gitCommit = null;

    // Reload
    await this.load();
  }
}

/**
 * Build execution context for handler
 */
function buildContext(executionContext, tool) {
  return {
    // Tool parameters (already validated)
    args: executionContext.args || {},

    // Client/session info
    clientId: executionContext.clientId,
    ws: executionContext.ws || null,
    geminiSession: executionContext.geminiSession || null,

    // Session state
    session: executionContext.session || {},

    // Capabilities flags
    capabilities: {
      messaging: !!executionContext.ws,
      voice: !!executionContext.geminiSession,
      audit: true
    },

    // Tool metadata (for handler's reference)
    meta: {
      toolId: tool.toolId,
      version: tool.version,
      category: tool.category
    }
  };
}

/**
 * Create standardized ToolResponse
 */
function createResponse(toolId, ok, dataOrError, startTime, intents = []) {
  const response = {
    ok,
    ...(ok ? { data: dataOrError } : { error: dataOrError }),
    intents,
    meta: {
      toolId,
      duration: Date.now() - startTime,
      responseSchemaVersion: TOOL_RESPONSE_SCHEMA_VERSION
    }
  };

  return response;
}

// Singleton instance
export const toolRegistry = new ToolRegistry();
