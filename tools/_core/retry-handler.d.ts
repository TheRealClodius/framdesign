/**
 * Type declarations for retry handler
 */

export interface RetryOptions {
  mode: 'text' | 'voice';
  maxRetries?: number;
  toolId: string;
  toolMetadata: any;
  clientId: string;
}

export function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<T>;
