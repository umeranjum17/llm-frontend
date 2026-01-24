/**
 * Error message utilities for user-friendly, actionable error messages
 */

export interface ActionableError {
  title: string;
  description: string;
  action?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  secondaryAction?: {
    label: string;
    onClick?: () => void;
  };
}

type ErrorCode =
  | "CHAT_CREATE_FAILED"
  | "CHAT_NOT_FOUND"
  | "MESSAGE_SEND_FAILED"
  | "API_KEY_MISSING"
  | "API_KEY_INVALID"
  | "PROVIDER_UNAVAILABLE"
  | "MODEL_UNAVAILABLE"
  | "RATE_LIMITED"
  | "CONTEXT_TOO_LONG"
  | "NETWORK_ERROR"
  | "TIMEOUT"
  | "STREAM_ERROR"
  | "DB_ERROR"
  | "DB_TIMEOUT"
  | "IMAGE_GENERATION_FAILED"
  | "EMBEDDING_FAILED"
  | "CONTENT_POLICY_VIOLATION"
  | "UNKNOWN";

/**
 * Structured API error response from server
 */
export interface APIErrorResponse {
  error: string;
  errorCode?: ErrorCode;
  provider?: string;
  retryAfter?: number;
  suggestion?: string;
  recoverable?: boolean;
}

const ERROR_MESSAGES: Record<ErrorCode, (context?: Record<string, string>) => ActionableError> = {
  CHAT_CREATE_FAILED: () => ({
    title: "Couldn't create chat",
    description: "Check your connection and try again.",
    action: {
      label: "Retry",
    },
  }),

  CHAT_NOT_FOUND: () => ({
    title: "Chat not found",
    description: "This chat may have been deleted.",
    action: {
      label: "New Chat",
    },
  }),

  MESSAGE_SEND_FAILED: (ctx) => ({
    title: "Message failed to send",
    description: ctx?.reason || "Check your connection and try again.",
    action: {
      label: "Retry",
    },
  }),

  API_KEY_MISSING: (ctx) => ({
    title: `Missing API key${ctx?.provider ? ` for ${ctx.provider}` : ""}`,
    description: "Add an API key to use this model.",
    action: {
      label: "Add Key",
      href: "/settings?tab=api-keys",
    },
  }),

  API_KEY_INVALID: (ctx) => ({
    title: `Invalid API key${ctx?.provider ? ` for ${ctx.provider}` : ""}`,
    description: "Check that your API key is correct and not expired.",
    action: {
      label: "Update Key",
      href: "/settings?tab=api-keys",
    },
  }),

  PROVIDER_UNAVAILABLE: (ctx) => ({
    title: `${ctx?.provider || "Provider"} is unavailable`,
    description: "The service may be experiencing issues. Try a different provider.",
    action: {
      label: "Change Model",
    },
    secondaryAction: {
      label: "Retry",
    },
  }),

  MODEL_UNAVAILABLE: (ctx) => ({
    title: `${ctx?.model || "Model"} is unavailable`,
    description: "This model may be deprecated or temporarily unavailable.",
    action: {
      label: "Choose Another",
    },
  }),

  RATE_LIMITED: (ctx) => ({
    title: "Rate limit exceeded",
    description: ctx?.retryAfter
      ? `Try again in ${ctx.retryAfter} seconds.`
      : "You've made too many requests. Wait a moment and try again.",
    action: {
      label: "Retry",
    },
  }),

  CONTEXT_TOO_LONG: (ctx) => ({
    title: "Message too long",
    description: ctx?.suggestion || "Your conversation exceeded the model's context limit.",
    action: {
      label: "Start New Chat",
    },
    secondaryAction: {
      label: "Compact History",
    },
  }),

  NETWORK_ERROR: () => ({
    title: "Connection failed",
    description: "Check your internet connection and try again.",
    action: {
      label: "Retry",
    },
  }),

  TIMEOUT: () => ({
    title: "Request timed out",
    description: "The server took too long to respond. Try again.",
    action: {
      label: "Retry",
    },
  }),

  STREAM_ERROR: () => ({
    title: "Response interrupted",
    description: "The AI's response was cut off. Try regenerating.",
    action: {
      label: "Regenerate",
    },
  }),

  DB_ERROR: () => ({
    title: "Database error",
    description: "There was a problem saving your data. Your messages are safe.",
    action: {
      label: "Retry",
    },
  }),

  DB_TIMEOUT: () => ({
    title: "Database timeout",
    description: "This often happens after an app update. Clear the cache to fix it.",
    action: {
      label: "Clear Cache",
    },
    secondaryAction: {
      label: "Refresh",
    },
  }),

  IMAGE_GENERATION_FAILED: (ctx) => ({
    title: "Image generation failed",
    description: ctx?.reason || "The model couldn't generate an image. Try a different prompt.",
    action: {
      label: "Retry",
    },
    secondaryAction: {
      label: "Change Model",
    },
  }),

  EMBEDDING_FAILED: (ctx) => ({
    title: "Embedding failed",
    description: ctx?.reason || "Couldn't generate embeddings for the text.",
    action: {
      label: "Retry",
    },
  }),

  CONTENT_POLICY_VIOLATION: () => ({
    title: "Content blocked",
    description: "Your request was blocked by safety policy. Try rephrasing.",
    action: {
      label: "Edit Message",
    },
  }),

  UNKNOWN: (ctx) => ({
    title: "Something went wrong",
    description: ctx?.message || "An unexpected error occurred. Try again.",
    action: {
      label: "Retry",
    },
  }),
};

/**
 * Get an actionable error message for a given error code
 */
export function getErrorMessage(
  code: ErrorCode,
  context?: Record<string, string>
): ActionableError {
  const getMessage = ERROR_MESSAGES[code] || ERROR_MESSAGES.UNKNOWN;
  return getMessage(context);
}

/**
 * Classify an error into an error code based on its type or message
 */
export function classifyError(error: unknown): { code: ErrorCode; context?: Record<string, string> } {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    const name = error.name.toLowerCase();

    // Network errors
    if (name === "typeerror" && message.includes("failed to fetch")) {
      return { code: "NETWORK_ERROR" };
    }
    if (message.includes("network") || message.includes("offline")) {
      return { code: "NETWORK_ERROR" };
    }

    // Timeout errors
    if (message.includes("timeout") || message.includes("timed out")) {
      return { code: "TIMEOUT" };
    }

    // Rate limiting
    if (message.includes("rate limit") || message.includes("429")) {
      const match = message.match(/(\d+)\s*seconds?/);
      return {
        code: "RATE_LIMITED",
        context: match ? { retryAfter: match[1] } : undefined,
      };
    }

    // API key errors
    if (message.includes("api key") || message.includes("apikey")) {
      if (message.includes("invalid") || message.includes("incorrect")) {
        return { code: "API_KEY_INVALID" };
      }
      if (message.includes("missing") || message.includes("not found") || message.includes("required")) {
        return { code: "API_KEY_MISSING" };
      }
    }

    // Authentication errors (usually means invalid key)
    if (message.includes("401") || message.includes("unauthorized") || message.includes("authentication")) {
      return { code: "API_KEY_INVALID" };
    }

    // Context length errors
    if (message.includes("context length") || message.includes("too long") || message.includes("max tokens")) {
      return { code: "CONTEXT_TOO_LONG" };
    }

    // Model unavailable
    if (message.includes("model") && (message.includes("unavailable") || message.includes("not found") || message.includes("deprecated"))) {
      return { code: "MODEL_UNAVAILABLE" };
    }

    // Stream errors
    if (message.includes("stream") && (message.includes("error") || message.includes("failed"))) {
      return { code: "STREAM_ERROR" };
    }

    // Database errors
    if (message.includes("indexeddb") || message.includes("dexie") || message.includes("database")) {
      if (message.includes("timeout")) {
        return { code: "DB_TIMEOUT" };
      }
      return { code: "DB_ERROR" };
    }

    // Provider-specific errors
    if (message.includes("provider")) {
      return { code: "PROVIDER_UNAVAILABLE" };
    }

    // Image generation errors
    if (message.includes("image") && (message.includes("generation") || message.includes("failed") || message.includes("generate"))) {
      return { code: "IMAGE_GENERATION_FAILED", context: { reason: error.message } };
    }

    // Embedding errors
    if (message.includes("embedding") && (message.includes("failed") || message.includes("error"))) {
      return { code: "EMBEDDING_FAILED", context: { reason: error.message } };
    }

    // Content policy violations
    if (message.includes("content policy") || message.includes("safety") || message.includes("blocked") || message.includes("inappropriate") || message.includes("content filter")) {
      return { code: "CONTENT_POLICY_VIOLATION" };
    }

    return { code: "UNKNOWN", context: { message: error.message } };
  }

  if (typeof error === "string") {
    return classifyError(new Error(error));
  }

  return { code: "UNKNOWN" };
}

/**
 * Get a user-friendly error message from any error
 */
export function getActionableError(error: unknown): ActionableError {
  const { code, context } = classifyError(error);
  return getErrorMessage(code, context);
}

/**
 * Format provider name for display
 */
export function formatProviderName(providerId: string): string {
  const names: Record<string, string> = {
    openai: "OpenAI",
    anthropic: "Anthropic",
    google: "Google",
    openrouter: "OpenRouter",
    deepseek: "DeepSeek",
    mistral: "Mistral",
    xai: "xAI",
    groq: "Groq",
    together: "Together AI",
    perplexity: "Perplexity",
    anyscale: "Anyscale",
  };

  if (providerId.startsWith("custom-openai:")) {
    return providerId.replace("custom-openai:", "");
  }

  return names[providerId] || providerId;
}

/**
 * Parse an API error response and return a structured error with context
 */
export async function parseAPIError(
  response: Response
): Promise<{ code: ErrorCode; context?: Record<string, string>; apiError?: APIErrorResponse }> {
  try {
    const data: APIErrorResponse = await response.json();

    // If server provided a structured error code, use it directly
    if (data.errorCode) {
      const context: Record<string, string> = {};
      if (data.provider) context.provider = data.provider;
      if (data.retryAfter) context.retryAfter = String(data.retryAfter);
      if (data.error) context.message = data.error;
      if (data.suggestion) context.reason = data.suggestion;

      return {
        code: data.errorCode as ErrorCode,
        context,
        apiError: data,
      };
    }

    // Fall back to classifying the error message
    const errorMessage = data.error || response.statusText;
    const classified = classifyError(new Error(errorMessage));

    return {
      ...classified,
      apiError: data,
    };
  } catch {
    // Couldn't parse JSON, classify based on status code
    return classifyFromStatusCode(response.status);
  }
}

/**
 * Classify error based on HTTP status code
 */
function classifyFromStatusCode(status: number): { code: ErrorCode; context?: Record<string, string> } {
  switch (status) {
    case 401:
      return { code: "API_KEY_INVALID" };
    case 403:
      return { code: "API_KEY_INVALID" };
    case 404:
      return { code: "MODEL_UNAVAILABLE" };
    case 413:
      return { code: "CONTEXT_TOO_LONG" };
    case 429:
      return { code: "RATE_LIMITED" };
    case 502:
    case 503:
    case 504:
      return { code: "PROVIDER_UNAVAILABLE" };
    default:
      return { code: "UNKNOWN" };
  }
}

/**
 * Get actionable error from a structured API error response
 */
export function getActionableErrorFromAPI(apiError: APIErrorResponse): ActionableError {
  const context: Record<string, string> = {};

  if (apiError.provider) context.provider = apiError.provider;
  if (apiError.retryAfter) context.retryAfter = String(apiError.retryAfter);
  if (apiError.error) context.message = apiError.error;
  if (apiError.suggestion) context.reason = apiError.suggestion;

  const code = (apiError.errorCode as ErrorCode) || "UNKNOWN";
  return getErrorMessage(code, context);
}
