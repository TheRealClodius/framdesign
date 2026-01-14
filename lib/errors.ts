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

  const isMissingToolRegistry =
    (errorLower.includes("tool_registry.json") || errorLower.includes("tool registry")) &&
    (errorLower.includes("enoent") ||
      errorLower.includes("no such file") ||
      errorLower.includes("cannot find module") ||
      errorLower.includes("cannot find package"));

  const isMissingAjvDependency =
    (errorLower.includes("ajv") || errorLower.includes("ajv-formats")) &&
    (errorLower.includes("cannot find module") ||
      errorLower.includes("cannot find package") ||
      errorLower.includes("module not found"));
  
  if (errorLower.includes("overloaded")) {
    return new Response(
      JSON.stringify({ error: "The AI model is currently overloaded. Please try again in a moment." }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }
  
  if (
    errorLower.includes("api key") ||
    errorLower.includes("authentication") ||
    errorLower.includes("401") ||
    errorLower.includes("403")
  ) {
    return new Response(
      JSON.stringify({
        error: "Invalid API key. Please check your GEMINI_API_KEY environment variable.",
        details: errorMessage,
      }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  if (isMissingToolRegistry) {
    return new Response(
      JSON.stringify({
        error: "Tool registry missing. Run npm run build:tools (or npm run setup).",
        details: errorMessage,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  if (isMissingAjvDependency) {
    return new Response(
      JSON.stringify({
        error: "Missing dependencies. Run npm install and then npm run build:tools.",
        details: errorMessage,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
  
  return new Response(
    JSON.stringify({ error: "Internal Server Error", details: errorMessage }),
    { status: 500, headers: { "Content-Type": "application/json" } }
  );
}
