/**
 * Gemini Native Provider Adapter
 *
 * Converts canonical JSON Schema to Gemini SDK format (Type.* enums).
 *
 * Used for Gemini Live API which requires Type.STRING, Type.OBJECT, etc.
 */

import { Type } from '@google/genai';

/**
 * Convert tool definition to Gemini SDK format
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
 * Recursively convert JSON Schema to Gemini SDK format
 *
 * @param {object} jsonSchema - JSON Schema object
 * @returns {object} - Gemini schema with Type.* enums
 *
 * Type mapping:
 * - 'string' -> Type.STRING
 * - 'number' | 'integer' -> Type.NUMBER
 * - 'boolean' -> Type.BOOLEAN
 * - 'object' -> Type.OBJECT (recursively convert properties)
 * - 'array' -> Type.ARRAY (recursively convert items)
 */
function convertToGeminiSchema(jsonSchema) {
  const TYPE_MAP = {
    'string': Type.STRING,
    'number': Type.NUMBER,
    'integer': Type.NUMBER,
    'boolean': Type.BOOLEAN,
    'object': Type.OBJECT,
    'array': Type.ARRAY
  };

  const geminiSchema = { type: TYPE_MAP[jsonSchema.type] || Type.STRING };

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
