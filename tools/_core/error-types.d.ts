/**
 * Type declarations for error types
 */

export const ErrorType: {
  readonly VALIDATION: 'VALIDATION';
  readonly NOT_FOUND: 'NOT_FOUND';
  readonly UNAUTHORIZED: 'UNAUTHORIZED';
  readonly RATE_LIMIT: 'RATE_LIMIT';
  readonly EXTERNAL_API: 'EXTERNAL_API';
  readonly TIMEOUT: 'TIMEOUT';
  readonly INTERNAL: 'INTERNAL';
  readonly USER_CONFIRMATION_REQUIRED: 'USER_CONFIRMATION_REQUIRED';
};

export class ToolError extends Error {
  constructor(
    type: string,
    message: string,
    retryable?: boolean,
    details?: any,
    idempotencyRequired?: boolean,
    partialSideEffects?: boolean,
    confirmation_request?: any
  );
  type: string;
  retryable: boolean;
  details?: any;
  idempotencyRequired?: boolean;
  partialSideEffects?: boolean;
  confirmation_request?: any;
}
