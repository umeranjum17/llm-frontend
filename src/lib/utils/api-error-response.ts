/**
 * Server-side API error response utilities
 *
 * Creates structured JSON error responses with error codes that clients can parse
 * to provide actionable error messages to users.
 */

import { formatProviderName } from "./error-messages";

/**
 * Error codes that can be returned by API routes
 */
export type APIErrorCode =
  | "API_KEY_MISSING"
  | "API_KEY_INVALID"
  | "RATE_LIMITED"
  | "CONTEXT_TOO_LONG"
  | "MODEL_UNAVAILABLE"
  | "PROVIDER_UNAVAILABLE"
  | "IMAGE_GENERATION_FAILED"
  | "EMBEDDING_FAILED"
  | "CONTENT_POLICY_VIOLATION"
  | "VALIDATION_ERROR"
  | "UNKNOWN_PROVIDER"
  | "NETWORK_ERROR"
  | "TIMEOUT"
  | "INTERNAL_ERROR";

/**
 * Structured API error response body
 */
export interface APIErrorBody {
  error: string;
  errorCode: APIErrorCode;
  provider?: string;
  retryAfter?: number;
  suggestion?: string;
  recoverable?: boolean;
}

/**
 * Map error codes to appropriate HTTP status codes
 */
export function getStatusCodeForError(errorCode: APIErrorCode): number {
  switch (errorCode) {
    case "API_KEY_MISSING":
      return 401;
    case "API_KEY_INVALID":
      return 401;
    case "RATE_LIMITED":
      return 429;
    case "CONTEXT_TOO_LONG":
      return 413;
    case "MODEL_UNAVAILABLE":
      return 404;
    case "PROVIDER_UNAVAILABLE":
      return 503;
    case "IMAGE_GENERATION_FAILED":
      return 422;
    case "EMBEDDING_FAILED":
      return 422;
    case "CONTENT_POLICY_VIOLATION":
      return 400;
    case "VALIDATION_ERROR":
      return 400;
    case "UNKNOWN_PROVIDER":
      return 400;
    case "NETWORK_ERROR":
      return 502;
    case "TIMEOUT":
      return 504;
    case "INTERNAL_ERROR":
    default:
      return 500;
  }
}

/**
 * Create a structured error Response for API routes
 */
export function createErrorResponse(
  errorCode: APIErrorCode,
  options: {
    provider?: string;
    message?: string;
    retryAfter?: number;
    suggestion?: string;
    recoverable?: boolean;
    statusCode?: number;
  } = {}
): Response {
  const { provider, message, retryAfter, suggestion, recoverable, statusCode } = options;

  const providerName = provider ? formatProviderName(provider) : undefined;

  // Generate default message based on error code
  const defaultMessage = getDefaultMessage(errorCode, providerName);

  const body: APIErrorBody = {
    error: message || defaultMessage,
    errorCode,
    ...(providerName && { provider: providerName }),
    ...(retryAfter !== undefined && { retryAfter }),
    ...(suggestion && { suggestion }),
    ...(recoverable !== undefined && { recoverable }),
  };

  return new Response(JSON.stringify(body), {
    status: statusCode ?? getStatusCodeForError(errorCode),
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Generate default error message for each error code
 */
function getDefaultMessage(errorCode: APIErrorCode, provider?: string): string {
  switch (errorCode) {
    case "API_KEY_MISSING":
      return provider ? `No API key provided for ${provider}` : "No API key provided";
    case "API_KEY_INVALID":
      return provider ? `Invalid API key for ${provider}` : "Invalid API key";
    case "RATE_LIMITED":
      return provider ? `Rate limit exceeded for ${provider}` : "Rate limit exceeded";
    case "CONTEXT_TOO_LONG":
      return "Message exceeds model's context limit";
    case "MODEL_UNAVAILABLE":
      return "Model is unavailable or not found";
    case "PROVIDER_UNAVAILABLE":
      return provider ? `${provider} is temporarily unavailable` : "Provider is unavailable";
    case "IMAGE_GENERATION_FAILED":
      return "Failed to generate image";
    case "EMBEDDING_FAILED":
      return "Failed to generate embeddings";
    case "CONTENT_POLICY_VIOLATION":
      return "Content was blocked by safety policy";
    case "VALIDATION_ERROR":
      return "Invalid request";
    case "UNKNOWN_PROVIDER":
      return "Unknown provider";
    case "NETWORK_ERROR":
      return "Network error occurred";
    case "TIMEOUT":
      return "Request timed out";
    case "INTERNAL_ERROR":
    default:
      return "An internal error occurred";
  }
}

/**
 * Parse an upstream error (from provider APIs) and classify it
 */
export function classifyUpstreamError(
  error: unknown,
  provider?: string
): { errorCode: APIErrorCode; message: string; retryAfter?: number } {
  const message = error instanceof Error ? error.message : String(error);
  const lowerMessage = message.toLowerCase();

  // Rate limiting
  if (lowerMessage.includes("rate limit") || lowerMessage.includes("429") || lowerMessage.includes("too many requests")) {
    const retryMatch = message.match(/(\d+)\s*seconds?/);
    return {
      errorCode: "RATE_LIMITED",
      message: `Rate limit exceeded${provider ? ` for ${formatProviderName(provider)}` : ""}`,
      retryAfter: retryMatch ? parseInt(retryMatch[1], 10) : undefined,
    };
  }

  // API key issues - includes "user not found" which OpenRouter returns for invalid/exhausted keys
  if (
    lowerMessage.includes("401") ||
    lowerMessage.includes("unauthorized") ||
    lowerMessage.includes("authentication") ||
    lowerMessage.includes("user not found") ||
    lowerMessage.includes("invalid key") ||
    lowerMessage.includes("invalid api key") ||
    lowerMessage.includes("incorrect api key") ||
    lowerMessage.includes("no auth") ||
    lowerMessage.includes("forbidden")
  ) {
    return {
      errorCode: "API_KEY_INVALID",
      message: `Invalid or exhausted API key${provider ? ` for ${formatProviderName(provider)}` : ""}. Please check your API key in settings.`,
    };
  }

  if (lowerMessage.includes("api key") && (lowerMessage.includes("missing") || lowerMessage.includes("required"))) {
    return {
      errorCode: "API_KEY_MISSING",
      message: `No API key provided${provider ? ` for ${formatProviderName(provider)}` : ""}`,
    };
  }

  // Context length
  if (lowerMessage.includes("context length") || lowerMessage.includes("too long") || lowerMessage.includes("max tokens") || lowerMessage.includes("maximum context")) {
    return {
      errorCode: "CONTEXT_TOO_LONG",
      message: "Message exceeds model's context limit",
    };
  }

  // Content policy
  if (lowerMessage.includes("content policy") || lowerMessage.includes("safety") || lowerMessage.includes("blocked") || lowerMessage.includes("inappropriate")) {
    return {
      errorCode: "CONTENT_POLICY_VIOLATION",
      message: "Content was blocked by safety policy",
    };
  }

  // Model unavailable
  if (lowerMessage.includes("model") && (lowerMessage.includes("not found") || lowerMessage.includes("unavailable") || lowerMessage.includes("deprecated"))) {
    return {
      errorCode: "MODEL_UNAVAILABLE",
      message,
    };
  }

  // Provider unavailable
  if (lowerMessage.includes("503") || lowerMessage.includes("service unavailable") || lowerMessage.includes("overloaded")) {
    return {
      errorCode: "PROVIDER_UNAVAILABLE",
      message: `${provider ? formatProviderName(provider) : "Provider"} is temporarily unavailable`,
    };
  }

  // Timeout
  if (lowerMessage.includes("timeout") || lowerMessage.includes("timed out")) {
    return {
      errorCode: "TIMEOUT",
      message: "Request timed out",
    };
  }

  // Network error
  if (lowerMessage.includes("network") || lowerMessage.includes("failed to fetch") || lowerMessage.includes("econnrefused")) {
    return {
      errorCode: "NETWORK_ERROR",
      message: "Network error - check your connection",
    };
  }

  // Default to internal error
  return {
    errorCode: "INTERNAL_ERROR",
    message: message || "An unexpected error occurred",
  };
}

/**
 * Create an error response from an upstream error (from provider APIs)
 */
export function createUpstreamErrorResponse(
  error: unknown,
  provider?: string,
  options: { recoverable?: boolean; suggestion?: string } = {}
): Response {
  const { errorCode, message, retryAfter } = classifyUpstreamError(error, provider);

  return createErrorResponse(errorCode, {
    provider,
    message,
    retryAfter,
    recoverable: options.recoverable,
    suggestion: options.suggestion,
  });
}
