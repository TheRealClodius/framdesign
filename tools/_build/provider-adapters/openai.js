/**
 * OpenAI Provider Adapter
 *
 * Converts canonical JSON Schema to OpenAI function calling format.
 * OpenAI uses standard JSON Schema with lowercase types.
 */

/**
 * Convert tool definition to OpenAI function format
 *
 * @param {object} toolDefinition - Tool from schema.json
 * @returns {object} - OpenAI function format
 *
 * Output format:
 * {
 *   type: 'function',
 *   function: {
 *     name: toolDefinition.toolId,
 *     description: toolDefinition.description,
 *     parameters: toolDefinition.jsonSchema
 *   }
 * }
 */
export function toOpenAI(toolDefinition) {
  return {
    type: 'function',
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
 * @returns {Array} - OpenAI tool schemas
 */
export function convertAllTools(tools) {
  return tools.map(tool => toOpenAI(tool));
}
