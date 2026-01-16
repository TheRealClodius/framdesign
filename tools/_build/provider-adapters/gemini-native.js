/**
 * Gemini Native Provider Adapter
 *
 * Converts canonical JSON Schema to Gemini Live API format.
 *
 * IMPORTANT: Gemini Live API requires LOWERCASE type strings in JSON schemas.
 * Using uppercase (STRING, OBJECT) causes silent failures where tools are ignored.
 * See: https://ai.google.dev/gemini-api/docs/function-calling
 */

/**
 * Convert tool definition to Gemini Live API format
 *
 * @param {object} toolDefinition - Tool from schema.json
 * @returns {object} - Gemini functionDeclarations format
 *
 * Expected output format:
 * {
 *   name: toolDefinition.toolId,
 *   description: toolDefinition.description,
 *   parameters: convertToGeminiSchema(toolDefinition.parameters)
 * }
 */
export function toGeminiNative(toolDefinition) {
  return {
    name: toolDefinition.toolId,
    description: toolDefinition.description,
    parameters: convertToGeminiSchema(toolDefinition.jsonSchema)
  };
}

/**
 * Convert all tools to Gemini Native format
 *
 * @param {Array} tools - Array of tool definitions
 * @returns {Array} - Gemini native tool schemas
 */
export function convertAllTools(tools) {
  return tools.map(tool => toGeminiNative(tool));
}

/**
 * Recursively convert JSON Schema to Gemini Live API format
 *
 * @param {object} jsonSchema - JSON Schema object
 * @returns {object} - Gemini schema with lowercase type strings
 *
 * Type mapping (all lowercase for Gemini Live API compatibility):
 * - 'string' -> 'string'
 * - 'number' | 'integer' -> 'number'
 * - 'boolean' -> 'boolean'
 * - 'object' -> 'object' (recursively convert properties)
 * - 'array' -> 'array' (recursively convert items)
 */
function convertToGeminiSchema(jsonSchema) {
  // Gemini Live API requires lowercase type strings
  const TYPE_MAP = {
    'string': 'string',
    'number': 'number',
    'integer': 'number',
    'boolean': 'boolean',
    'object': 'object',
    'array': 'array'
  };

  const geminiSchema = { type: TYPE_MAP[jsonSchema.type] || 'string' };

  if (jsonSchema.type === 'object' && jsonSchema.properties) {
    geminiSchema.properties = {};
    for (const [key, prop] of Object.entries(jsonSchema.properties)) {
      geminiSchema.properties[key] = convertToGeminiSchema(prop);
    }
    if (jsonSchema.required) geminiSchema.required = jsonSchema.required;
  }

  if (jsonSchema.type === 'array' && jsonSchema.items) {
    geminiSchema.items = convertToGeminiSchema(jsonSchema.items);
  }

  if (jsonSchema.enum) geminiSchema.enum = jsonSchema.enum;
  if (jsonSchema.description) geminiSchema.description = jsonSchema.description;

  return geminiSchema;
}
