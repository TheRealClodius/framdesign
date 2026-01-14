/**
 * Unit tests for error-types.js
 */

import { ErrorType, ToolError, IntentType } from '../../../tools/_core/error-types.js';

describe('ErrorType', () => {
  test('should have all expected error types', () => {
    expect(ErrorType.VALIDATION).toBe('VALIDATION');
    expect(ErrorType.NOT_FOUND).toBe('NOT_FOUND');
    expect(ErrorType.INTERNAL).toBe('INTERNAL');
    expect(ErrorType.MODE_RESTRICTED).toBe('MODE_RESTRICTED');
    expect(ErrorType.BUDGET_EXCEEDED).toBe('BUDGET_EXCEEDED');
    expect(ErrorType.CONFIRMATION_REQUIRED).toBe('CONFIRMATION_REQUIRED');
    expect(ErrorType.SESSION_INACTIVE).toBe('SESSION_INACTIVE');
    expect(ErrorType.TRANSIENT).toBe('TRANSIENT');
    expect(ErrorType.PERMANENT).toBe('PERMANENT');
    expect(ErrorType.RATE_LIMIT).toBe('RATE_LIMIT');
    expect(ErrorType.AUTH).toBe('AUTH');
    expect(ErrorType.CONFLICT).toBe('CONFLICT');
  });
});

describe('ToolError', () => {
  test('should create ToolError with required fields', () => {
    const error = new ToolError(ErrorType.TRANSIENT, 'Test error');
    
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('ToolError');
    expect(error.type).toBe(ErrorType.TRANSIENT);
    expect(error.message).toBe('Test error');
    expect(error.retryable).toBe(false); // Default
    expect(error.idempotencyRequired).toBe(false); // Default
    expect(error.partialSideEffects).toBe(false); // Default
  });

  test('should create ToolError with options', () => {
    const error = new ToolError(ErrorType.TRANSIENT, 'Test error', {
      retryable: true,
      idempotencyRequired: true,
      partialSideEffects: true,
      details: { code: 500 },
      confirmation_request: { message: 'Confirm?' }
    });
    
    expect(error.retryable).toBe(true);
    expect(error.idempotencyRequired).toBe(true);
    expect(error.partialSideEffects).toBe(true);
    expect(error.details).toEqual({ code: 500 });
    expect(error.confirmation_request).toEqual({ message: 'Confirm?' });
  });

  test('should handle partial options', () => {
    const error = new ToolError(ErrorType.PERMANENT, 'Permanent error', {
      retryable: false
    });
    
    expect(error.retryable).toBe(false);
    expect(error.idempotencyRequired).toBe(false); // Default
    expect(error.partialSideEffects).toBe(false); // Default
    expect(error.details).toBe(null); // Default
  });

  test('should be throwable and catchable', () => {
    expect(() => {
      throw new ToolError(ErrorType.TRANSIENT, 'Test');
    }).toThrow(ToolError);
    
    try {
      throw new ToolError(ErrorType.TRANSIENT, 'Test');
    } catch (error) {
      expect(error).toBeInstanceOf(ToolError);
      expect(error.type).toBe(ErrorType.TRANSIENT);
    }
  });
});

describe('IntentType', () => {
  test('should have all expected intent types', () => {
    expect(IntentType.END_VOICE_SESSION).toBe('END_VOICE_SESSION');
    expect(IntentType.SUPPRESS_AUDIO).toBe('SUPPRESS_AUDIO');
    expect(IntentType.SUPPRESS_TRANSCRIPT).toBe('SUPPRESS_TRANSCRIPT');
    expect(IntentType.SET_PENDING_MESSAGE).toBe('SET_PENDING_MESSAGE');
  });
});
