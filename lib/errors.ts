/**
 * Error handling utilities
 */

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class OverloadedError extends ApiError {
  constructor() {
    super(
      "The AI model is currently overloaded. Please try again in a moment.",
      503
    );
    this.name = "OverloadedError";
  }
}

export class AuthenticationError extends ApiError {
  constructor(details?: string) {
    super(
      "Invalid API key. Please check your GEMINI_API_KEY environment variable.",
      401,
      details
    );
    this.name = "AuthenticationError";
  }
}

/**
 * Check if an error is a cache-related error (cache not found or permission denied)
 * These errors should trigger a fallback to non-cached requests
 */
export function isCacheError(error: unknown): boolean {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorLower = errorMessage.toLowerCase();
  
  return (
    errorLower.includes("cachedcontent not found") ||
    errorLower.includes("cache") && errorLower.includes("permission denied") ||
    errorLower.includes("cache") && errorLower.includes("not found") ||
    (errorLower.includes("403") && errorLower.includes("cache"))
  );
}

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  const errorMessage = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  
  return (
    errorMessage.includes("overloaded") ||
    errorMessage.includes("rate limit") ||
    errorMessage.includes("quota") ||
    errorMessage.includes("503") ||
    errorMessage.includes("429")
  );
}

/**
 * Parse error from API response
 */
export async function parseApiError(response: Response): Promise<ApiError> {
  let errorData: { error?: string; details?: string } = {};
  
  try {
    errorData = await response.json();
  } catch {
    // If JSON parsing fails, use status text
    errorData = { error: response.statusText };
  }
  
  const errorMessage = errorData.error || errorData.details || `Failed to fetch response: ${response.status}`;
  
  if (response.status === 503 || errorMessage.toLowerCase().includes("overloaded")) {
    return new OverloadedError();
  }
  
  if (
    response.status === 401 ||
    response.status === 403 ||
    errorMessage.toLowerCase().includes("api key") ||
    errorMessage.toLowerCase().includes("authentication")
  ) {
    return new AuthenticationError(errorMessage);
  }
  
  return new ApiError(errorMessage, response.status, errorData.details);
}

/**
 * Handle server-side error and return appropriate NextResponse
 */
export function handleServerError(error: unknown): Response {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorLower = errorMessage.toLowerCase();
  
  if (errorLower.includes("overloaded")) {
    return new Response(
      JSON.stringify({ error: "The AI model is currently overloaded. Please try again in a moment." }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }
  
  // Check for cache errors first (before generic 403/auth checks)
  // Cache errors are not authentication errors - they indicate cache expired/deleted
  if (isCacheError(error)) {
    return new Response(
      JSON.stringify({
        error: "Cache error: Content cache expired or not found. Retrying without cache.",
        details: errorMessage,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
  
  // Check for actual API key/authentication errors
  // Only match 401 or explicit API key/auth messages (not generic 403)
  if (
    errorLower.includes("api key") ||
    errorLower.includes("authentication") ||
    errorLower.includes("401") ||
    (errorLower.includes("403") && !errorLower.includes("cache") && !errorLower.includes("cachedcontent"))
  ) {
    return new Response(
      JSON.stringify({
        error: "Invalid API key. Please check your GEMINI_API_KEY environment variable.",
        details: errorMessage,
      }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }
  
  return new Response(
    JSON.stringify({ error: "Internal Server Error", details: errorMessage }),
    { status: 500, headers: { "Content-Type": "application/json" } }
  );
}
