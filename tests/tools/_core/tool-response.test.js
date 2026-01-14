/**
 * Unit tests for tool-response.js
 */

import { validateToolResponse, TOOL_RESPONSE_SCHEMA_VERSION } from '../../../tools/_core/tool-response.js';
import { ErrorType } from '../../../tools/_core/error-types.js';

describe('TOOL_RESPONSE_SCHEMA_VERSION', () => {
  test('should have correct version', () => {
    expect(TOOL_RESPONSE_SCHEMA_VERSION).toBe('1.0.0');
  });
});

describe('validateToolResponse', () => {
  describe('success responses', () => {
    test('should validate minimal success response', () => {
      const response = {
        ok: true,
        data: { result: 'success' },
        meta: {}
      };
      
      expect(() => validateToolResponse(response)).not.toThrow();
    });

    test('should validate success response with intents', () => {
      const response = {
        ok: true,
        data: { result: 'success' },
        intents: [
          { type: 'END_VOICE_SESSION', after: 'current_turn' }
        ],
        meta: {}
      };
      
      expect(() => validateToolResponse(response)).not.toThrow();
    });

    test('should validate success response without data', () => {
      const response = {
        ok: true,
        meta: {}
      };
      
      expect(() => validateToolResponse(response)).not.toThrow();
    });
  });

  describe('error responses', () => {
    test('should validate error response', () => {
      const response = {
        ok: false,
        error: {
          type: ErrorType.TRANSIENT,
          message: 'Test error',
          retryable: true
        },
        meta: {}
      };
      
      expect(() => validateToolResponse(response)).not.toThrow();
    });

    test('should validate error response with intents', () => {
      const response = {
        ok: false,
        error: {
          type: ErrorType.TRANSIENT,
          message: 'Test error',
          retryable: false
        },
        intents: [
          { type: 'SUPPRESS_AUDIO', value: true }
        ],
        meta: {}
      };
      
      expect(() => validateToolResponse(response)).not.toThrow();
    });
  });

  describe('validation failures', () => {
    test('should reject non-object', () => {
      expect(() => validateToolResponse(null)).toThrow('ToolResponse must be an object');
      expect(() => validateToolResponse(undefined)).toThrow('ToolResponse must be an object');
      expect(() => validateToolResponse('string')).toThrow('ToolResponse must be an object');
    });

    test('should reject missing ok field', () => {
      const response = {
        data: { result: 'success' }
      };
      
      expect(() => validateToolResponse(response)).toThrow('ToolResponse.ok must be boolean');
    });

    test('should reject non-boolean ok field', () => {
      const response = {
        ok: 'true',
        data: { result: 'success' }
      };
      
      expect(() => validateToolResponse(response)).toThrow('ToolResponse.ok must be boolean');
    });

    test('should reject error response without error object', () => {
      const response = {
        ok: false
      };
      
      expect(() => validateToolResponse(response)).toThrow('ToolResponse with ok=false must have error object');
    });

    test('should reject error without type', () => {
      const response = {
        ok: false,
        error: {
          message: 'Test error',
          retryable: false
        }
      };
      
      expect(() => validateToolResponse(response)).toThrow('ToolResponse.error must have type string');
    });

    test('should reject error without message', () => {
      const response = {
        ok: false,
        error: {
          type: ErrorType.TRANSIENT,
          retryable: false
        }
      };
      
      expect(() => validateToolResponse(response)).toThrow('ToolResponse.error must have message string');
    });

    test('should reject error without retryable', () => {
      const response = {
        ok: false,
        error: {
          type: ErrorType.TRANSIENT,
          message: 'Test error'
        }
      };
      
      expect(() => validateToolResponse(response)).toThrow('ToolResponse.error must have retryable boolean');
    });
  });

  describe('intents validation', () => {
    test('should reject non-array intents', () => {
      const response = {
        ok: true,
        data: {},
        intents: 'not an array',
        meta: {}
      };
      
      expect(() => validateToolResponse(response)).toThrow('ToolResponse.intents must be an array if present');
    });

    test('should reject invalid intent objects', () => {
      const response = {
        ok: true,
        data: {},
        intents: [
          'not an object',
          { type: 'VALID' },
          null
        ],
        meta: {}
      };
      
      expect(() => validateToolResponse(response)).toThrow('Each intent must be an object');
    });

    test('should reject intents without type', () => {
      const response = {
        ok: true,
        data: {},
        intents: [
          { after: 'current_turn' }
        ],
        meta: {}
      };
      
      expect(() => validateToolResponse(response)).toThrow('Each intent must have type string');
    });
  });

  describe('meta validation', () => {
    test('should reject non-object meta', () => {
      const response = {
        ok: true,
        data: {},
        meta: 'not an object'
      };
      
      expect(() => validateToolResponse(response)).toThrow('ToolResponse.meta must be an object if present');
    });

    test('should allow undefined meta', () => {
      const response = {
        ok: true,
        data: {}
      };
      
      expect(() => validateToolResponse(response)).not.toThrow();
    });
  });
});
