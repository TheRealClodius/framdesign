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

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { ErrorType, ToolError } from './error-types.js';
import { validateToolResponse, TOOL_RESPONSE_SCHEMA_VERSION } from './tool-response.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REGISTRY_PATH = join(__dirname, '..', 'tool_registry.json');

/**
 * ToolRegistry class
 *
 * Singleton instance exported as `toolRegistry`
 */
class ToolRegistry {
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

    // Read registry file
    const registryJson = readFileSync(REGISTRY_PATH, 'utf-8');
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
      try {
        const handlerModule = await import(tool.handlerPath);
        if (typeof handlerModule.execute !== 'function') {
          throw new Error(`Handler ${tool.toolId} must export an execute function`);
        }
        this.handlers.set(tool.toolId, handlerModule.execute);
      } catch (error) {
        throw new Error(`Failed to load handler for ${tool.toolId}: ${error.message}`);
      }
    }

    console.log(`✓ Tool registry loaded: v${this.version} (${this.tools.size} tools)`);
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
      return createResponse(toolId, false, {
        type: ErrorType.NOT_FOUND,
        message: `Tool ${toolId} not found`,
        retryable: false
      }, startTime);
    }

    const tool = this.tools.get(toolId);
    const validator = this.validators.get(toolId);
    const handler = this.handlers.get(toolId);

    // Validate parameters
    const valid = validator(executionContext.args || {});
    if (!valid) {
      const errors = validator.errors.map(e => `${e.instancePath} ${e.message}`).join(', ');
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
        console.error(`[Registry] Handler ${toolId} returned invalid ToolResponse:`, validationError.message);
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

      return result;

    } catch (error) {
      // Handler threw an exception
      if (error instanceof ToolError) {
        // Expected domain error
        return createResponse(toolId, false, {
          type: error.type,
          message: error.message,
          retryable: error.retryable,
          idempotencyRequired: error.idempotencyRequired,
          partialSideEffects: error.partialSideEffects,
          details: error.details,
          confirmation_request: error.confirmation_request
        }, startTime);
      } else {
        // Unexpected error
        console.error(`[Registry] Unexpected error in handler ${toolId}:`, error);
        return createResponse(toolId, false, {
          type: ErrorType.INTERNAL,
          message: `Unexpected error: ${error.message}`,
          retryable: false,
          partialSideEffects: true // Conservative assumption
        }, startTime);
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
