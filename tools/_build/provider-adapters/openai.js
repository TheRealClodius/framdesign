/**
 * OpenAI Provider Adapter
 *
 * Converts canonical JSON Schema to OpenAI function calling format.
 *
 * OpenAI uses JSON Schema natively, so this is mostly pass-through.
 */

/**
 * Convert tool definition to OpenAI function calling format
 *
 * @param {object} toolDefinition - Tool from schema.json
 * @returns {object} - OpenAI function schema
 *
 * Expected output format:
 * {
 *   type: "function",
 *   function: {
 *     name: toolDefinition.toolId,
 *     description: toolDefinition.description,
 *     parameters: toolDefinition.parameters  // Pass-through JSON Schema
 *   }
 * }
 */
export function toOpenAI(toolDefinition) {
  return {
    type: "function",
    function: {
      name: toolDefinition.toolId,
      description: toolDefinition.description,
      parameters: toolDefinition.jsonSchema
    }
  };
}

/**
 * Convert all tools to OpenAI format
 *
 * @param {Array} tools - Array of tool definitions
 * @returns {Array} - OpenAI function schemas
 */
export function convertAllTools(tools) {
  return tools.map(tool => toOpenAI(tool));
}
