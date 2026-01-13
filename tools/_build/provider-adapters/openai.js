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
