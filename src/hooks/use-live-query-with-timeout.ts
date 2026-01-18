import { useState, useEffect, useCallback, useRef } from "react";
import { useLiveQuery } from "dexie-react-hooks";

interface UseLiveQueryWithTimeoutResult<T> {
  data: T | undefined;
  isLoading: boolean;
  isTimedOut: boolean;
  error: Error | null;
  retry: () => void;
}

/**
 * Wrapper around useLiveQuery that adds timeout handling for mobile devices.
 * On Android Chrome, IndexedDB can be slow or blocked, causing infinite loading.
 * This hook provides timeout detection and retry functionality.
 */
export function useLiveQueryWithTimeout<T>(
  queryFn: () => Promise<T> | T | undefined,
  deps: any[],
  options?: {
    timeoutMs?: number;
    defaultValue?: T;
  }
): UseLiveQueryWithTimeoutResult<T> {
  const timeoutMs = options?.timeoutMs ?? 5000; // Default 5 second timeout
  const defaultValue = options?.defaultValue;

  const [isTimedOut, setIsTimedOut] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasLoadedRef = useRef(false);

  // Use the standard useLiveQuery hook
  const data = useLiveQuery(queryFn, [...deps, retryCount]);

  // Track if we've received data
  const isLoading = data === undefined && !isTimedOut && !error;

  // Set up timeout
  useEffect(() => {
    // Reset state on deps change
    hasLoadedRef.current = false;
    setIsTimedOut(false);
    setError(null);

    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set new timeout
    timeoutRef.current = setTimeout(() => {
      if (!hasLoadedRef.current && data === undefined) {
        console.warn("[useLiveQueryWithTimeout] Query timed out after", timeoutMs, "ms");
        setIsTimedOut(true);
      }
    }, timeoutMs);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, retryCount, timeoutMs]);

  // Mark as loaded when data arrives
  useEffect(() => {
    if (data !== undefined) {
      hasLoadedRef.current = true;
      setIsTimedOut(false);
      setError(null);

      // Clear timeout since we got data
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    }
  }, [data]);

  const retry = useCallback(() => {
    console.log("[useLiveQueryWithTimeout] Retrying query...");
    hasLoadedRef.current = false;
    setIsTimedOut(false);
    setError(null);
    setRetryCount((c) => c + 1);
  }, []);

  return {
    data: data ?? defaultValue,
    isLoading,
    isTimedOut,
    error,
    retry,
  };
}
