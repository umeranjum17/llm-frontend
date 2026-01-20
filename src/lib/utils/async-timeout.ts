/**
 * Timeout utilities for wrapping async operations with deadline enforcement.
 * Prevents indefinite hangs in PWA and multi-tab scenarios.
 */

export class TimeoutError extends Error {
  constructor(
    public operationName: string,
    public timeoutMs: number
  ) {
    super(`${operationName} timed out after ${timeoutMs}ms`);
    this.name = "TimeoutError";
  }
}

/**
 * Wrap a promise with a timeout. Rejects with TimeoutError if deadline exceeded.
 * @param promise The promise to wrap
 * @param ms Timeout in milliseconds
 * @param operationName Name for error messages
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  operationName: string = "Operation"
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new TimeoutError(operationName, ms));
    }, ms);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (error) {
    clearTimeout(timeoutId!);
    throw error;
  }
}

/**
 * Execute with timeout and return fallback value on timeout (instead of throwing).
 * Useful for non-critical operations that shouldn't block the main flow.
 * @param promise The promise to wrap
 * @param ms Timeout in milliseconds
 * @param fallback Value to return if timeout occurs
 * @param operationName Name for logging
 */
export async function withTimeoutFallback<T>(
  promise: Promise<T>,
  ms: number,
  fallback: T,
  operationName?: string
): Promise<T> {
  try {
    return await withTimeout(promise, ms, operationName);
  } catch (error) {
    if (error instanceof TimeoutError) {
      console.warn(`[Timeout] ${operationName || "Operation"} timed out, using fallback`);
      return fallback;
    }
    throw error;
  }
}

/**
 * Execute with timeout, returning null on timeout or error.
 * Useful for optional operations that should never block.
 */
export async function withTimeoutSafe<T>(
  promise: Promise<T>,
  ms: number,
  operationName?: string
): Promise<T | null> {
  try {
    return await withTimeout(promise, ms, operationName);
  } catch (error) {
    if (error instanceof TimeoutError) {
      console.warn(`[Timeout] ${operationName || "Operation"} timed out`);
    } else {
      console.warn(`[Timeout] ${operationName || "Operation"} failed:`, error);
    }
    return null;
  }
}
