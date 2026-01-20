/**
 * Error classification and handling utilities
 */

export enum ErrorSeverity {
  CRITICAL = "critical", // System-breaking errors
  ERROR = "error", // Operation failed, user action needed
  WARNING = "warning", // Operation partially succeeded
  INFO = "info", // Informational message
}

export interface ClassifiedError {
  severity: ErrorSeverity;
  message: string;
  actionableMessage?: string;
  originalError?: unknown;
}

/**
 * Classifies an error based on its type and provides actionable feedback.
 *
 * @param error - The error to classify
 * @param context - Context about where the error occurred
 * @returns Classified error with severity and actionable message
 */
export function classifyError(error: unknown, context?: string): ClassifiedError {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const lowerMessage = errorMessage.toLowerCase();

  // API Key errors
  if (
    lowerMessage.includes("api key") ||
    lowerMessage.includes("unauthorized") ||
    lowerMessage.includes("401") ||
    lowerMessage.includes("403") ||
    lowerMessage.includes("authentication")
  ) {
    return {
      severity: ErrorSeverity.ERROR,
      message: errorMessage,
      actionableMessage:
        "Invalid or missing API key. Check Settings > API Keys to configure your provider credentials.",
      originalError: error,
    };
  }

  // Rate limit errors
  if (
    lowerMessage.includes("rate limit") ||
    lowerMessage.includes("429") ||
    lowerMessage.includes("too many requests") ||
    lowerMessage.includes("quota")
  ) {
    return {
      severity: ErrorSeverity.WARNING,
      message: errorMessage,
      actionableMessage:
        "Rate limit exceeded. Please wait a moment and try again, or check your API usage.",
      originalError: error,
    };
  }

  // Network errors
  if (
    lowerMessage.includes("network") ||
    lowerMessage.includes("fetch") ||
    lowerMessage.includes("timeout") ||
    lowerMessage.includes("connection") ||
    lowerMessage.includes("econnrefused")
  ) {
    return {
      severity: ErrorSeverity.WARNING,
      message: errorMessage,
      actionableMessage:
        "Network error occurred. Check your internet connection and try again.",
      originalError: error,
    };
  }

  // Model/Provider errors
  if (
    lowerMessage.includes("model") ||
    lowerMessage.includes("provider") ||
    lowerMessage.includes("not found") ||
    lowerMessage.includes("unsupported")
  ) {
    return {
      severity: ErrorSeverity.ERROR,
      message: errorMessage,
      actionableMessage:
        "Model or provider configuration error. Verify your model settings in Settings > Models.",
      originalError: error,
    };
  }

  // Input validation errors
  if (
    lowerMessage.includes("invalid") ||
    lowerMessage.includes("validation") ||
    lowerMessage.includes("required")
  ) {
    return {
      severity: ErrorSeverity.ERROR,
      message: errorMessage,
      actionableMessage: errorMessage, // Validation messages are usually already actionable
      originalError: error,
    };
  }

  // Generic error
  return {
    severity: ErrorSeverity.ERROR,
    message: errorMessage,
    actionableMessage: context
      ? `${context} failed: ${errorMessage}`
      : errorMessage,
    originalError: error,
  };
}

/**
 * Formats an error for display to the user.
 *
 * @param error - The classified error
 * @returns User-friendly error message
 */
export function formatErrorMessage(error: ClassifiedError): string {
  return error.actionableMessage || error.message;
}

/**
 * Logs an error with appropriate severity.
 *
 * @param error - The classified error
 * @param context - Additional context for logging
 */
export function logError(error: ClassifiedError, context?: string): void {
  const prefix = context ? `[${context}]` : "";

  switch (error.severity) {
    case ErrorSeverity.CRITICAL:
      console.error(`${prefix} CRITICAL:`, error.message, error.originalError);
      break;
    case ErrorSeverity.ERROR:
      console.error(`${prefix} ERROR:`, error.message, error.originalError);
      break;
    case ErrorSeverity.WARNING:
      console.warn(`${prefix} WARNING:`, error.message);
      break;
    case ErrorSeverity.INFO:
      console.info(`${prefix} INFO:`, error.message);
      break;
  }
}
