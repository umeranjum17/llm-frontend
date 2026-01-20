"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { db } from "@/lib/db/schema";
import { toast } from "sonner";
import { RefreshCw, AlertTriangle } from "lucide-react";
import { useLoadingStore } from "@/stores/loading-store";

interface DBHealthState {
  isHealthy: boolean;
  isChecking: boolean;
  error: string | null;
  retryCount: number;
}

/**
 * Hook to monitor IndexedDB health and handle recovery scenarios.
 * Detects blocked upgrades, version mismatches, and stalled opens.
 */
export function useDBHealth() {
  const [state, setState] = useState<DBHealthState>({
    isHealthy: true,
    isChecking: true,
    error: null,
    retryCount: 0,
  });
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isValidatingConnectionRef = useRef(false);
  const maxRetries = 3;
  const setDbInitializing = useLoadingStore((state) => state.setDbInitializing);

  const clearCacheAndReload = useCallback(async () => {
    try {
      // Clear all caches
      if ("caches" in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map((name) => caches.delete(name)));
      }

      // Unregister service worker
      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((reg) => reg.unregister()));
      }

      // Delete IndexedDB
      if (db.isOpen()) {
        await db.close();
      }
      const deleteReq = indexedDB.deleteDatabase("LuminaDB");
      await new Promise<void>((resolve, reject) => {
        deleteReq.onsuccess = () => resolve();
        deleteReq.onerror = () => reject(deleteReq.error);
        deleteReq.onblocked = () => {
          // If blocked, wait a bit and try again
          setTimeout(() => resolve(), 1000);
        };
      });

      // Reload the page
      window.location.reload();
    } catch (error) {
      console.error("[DB Health] Failed to clear cache:", error);
      toast.error("Failed to clear cache. Please manually refresh the page.");
    }
  }, []);

  const handleRecovery = useCallback(
    (errorType: string, message: string, allowRetry: boolean = false) => {
      setState((prev) => ({
        isHealthy: false,
        isChecking: false,
        error: message,
        retryCount: prev.retryCount,
      }));

      setDbInitializing(false);

      toast.error("Database Error", {
        description: message,
        duration: Infinity,
        icon: <AlertTriangle className="h-4 w-4" />,
        action: {
          label: "Clear Cache & Reload",
          onClick: clearCacheAndReload,
        },
        cancel: allowRetry
          ? {
              label: "Retry",
              onClick: () => {
                setState((prev) => ({
                  ...prev,
                  isHealthy: true,
                  isChecking: true,
                  error: null,
                  retryCount: prev.retryCount + 1,
                }));
              },
            }
          : {
              label: "Refresh",
              onClick: () => window.location.reload(),
            },
      });
    },
    [clearCacheAndReload, setDbInitializing]
  );

  useEffect(() => {
    let timeoutId: NodeJS.Timeout | null = null;
    let isMounted = true;

    const checkDBHealth = async () => {
      const currentRetryCount = state.retryCount;
      
      // Exponential backoff for retries
      if (currentRetryCount > 0 && currentRetryCount <= maxRetries) {
        const backoffMs = Math.min(1000 * Math.pow(2, currentRetryCount - 1), 5000);
        console.log(`[DB Health] Retrying in ${backoffMs}ms (attempt ${currentRetryCount + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }
      
      try {
        setDbInitializing(true, `Initializing database${currentRetryCount > 0 ? ` (retry ${currentRetryCount}/${maxRetries})` : ""}...`);
        
        // Set up blocked/versionchange listeners before opening
        db.on("blocked", () => {
          if (!isMounted) return;
          handleRecovery(
            "blocked",
            "Database upgrade is blocked by another tab. Please close other tabs and refresh."
          );
        });

        db.on("versionchange", () => {
          if (!isMounted) return;
          handleRecovery(
            "versionchange",
            "Database schema changed. Please refresh to update."
          );
        });

        // Try to open the database with a timeout
        const openPromise = db.open();
        const timeoutDuration = currentRetryCount > 0 ? 10000 : 5000; // Longer timeout for retries
        
        timeoutId = setTimeout(() => {
          if (!isMounted) return;
          const canRetry = currentRetryCount < maxRetries;
          handleRecovery(
            "timeout",
            `Database open timed out. ${canRetry ? "Retrying..." : "This may indicate a stale cache or corrupted database."}`,
            canRetry
          );
        }, timeoutDuration);

        await openPromise;

        // Clear timeout if open succeeded
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }

        // Verify database is actually usable by doing a simple query
        try {
          await db.settings.count();
        } catch (queryError) {
          if (!isMounted) return;
          const errorName = (queryError as Error)?.name || "UnknownError";
          if (
            errorName === "DatabaseClosedError" ||
            errorName === "InvalidStateError"
          ) {
            handleRecovery(
              "query_failed",
              "Database is not accessible. Please refresh or clear cache."
            );
            return;
          }
          // Other query errors might be OK (e.g., empty DB)
        }

        if (isMounted) {
          setState({
            isHealthy: true,
            isChecking: false,
            error: null,
            retryCount: 0, // Reset on success
          });
          setDbInitializing(false);
        }
      } catch (error) {
        if (!isMounted) return;

        const errorObj = error as Error;
        const errorName = errorObj?.name || "UnknownError";
        const canRetry = currentRetryCount < maxRetries;

        // Handle specific Dexie errors
        if (errorName === "VersionError") {
          handleRecovery(
            "version_error",
            "Database version mismatch. This usually means the app was updated. Please refresh.",
            false // Version errors need cache clear, not retry
          );
        } else if (errorName === "DatabaseClosedError") {
          handleRecovery(
            "closed_error",
            `Database was closed unexpectedly. ${canRetry ? "Retrying..." : "Please refresh."}`,
            canRetry
          );
        } else if (errorName === "InvalidStateError") {
          handleRecovery(
            "invalid_state",
            "Database is in an invalid state. Please clear cache and refresh.",
            false
          );
        } else if (errorName === "QuotaExceededError") {
          handleRecovery(
            "quota_exceeded",
            "Storage quota exceeded. Please clear some data or increase storage.",
            false
          );
        } else {
          // Generic error - allow retry
          handleRecovery(
            "unknown_error",
            `Database error: ${errorObj?.message || "Unknown error"}. ${canRetry ? "Retrying..." : "Please refresh."}`,
            canRetry
          );
        }
      }
    };

    checkDBHealth();

    return () => {
      isMounted = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, [handleRecovery, state.retryCount, setDbInitializing]);

  // Focus-based DB connection validation to handle multi-tab scenarios
  useEffect(() => {
    const handleFocusChange = async () => {
      // Only act when window gains focus AND is visible
      if (!document.hasFocus() || document.visibilityState !== 'visible') {
        return;
      }

      // Prevent concurrent validation attempts
      if (isValidatingConnectionRef.current) {
        return;
      }

      isValidatingConnectionRef.current = true;

      try {
        // Check if database connection is healthy
        if (!db.isOpen()) {
          console.log('[DB Health] Connection closed while in background, reopening...');
          await db.open();
          return;
        }

        // Verify connection is actually usable with a lightweight query
        try {
          await db.settings.count();
          // Connection is healthy, no action needed
        } catch (queryError) {
          const errorName = (queryError as Error)?.name || 'UnknownError';

          if (
            errorName === 'DatabaseClosedError' ||
            errorName === 'InvalidStateError'
          ) {
            // Connection is stale, reinitialize
            console.log('[DB Health] Stale connection detected, reinitializing...');

            // Close if somehow still "open" but unusable
            if (db.isOpen()) {
              await db.close();
            }

            // Reopen fresh connection
            await db.open();

            // Verify the new connection works
            await db.settings.count();
          } else {
            // Other errors are transient, log but don't reinitialize
            console.warn('[DB Health] Query error on focus, but continuing:', queryError);
          }
        }
      } catch (error) {
        console.error('[DB Health] Failed to validate/reinitialize connection:', error);

        // Last resort: show error to user if we can't recover
        const errorObj = error as Error;
        handleRecovery(
          'focus_validation_failed',
          `Database connection failed: ${errorObj?.message || 'Unknown error'}`,
          true // Allow retry
        );
      } finally {
        isValidatingConnectionRef.current = false;
      }
    };

    // Listen for focus events
    window.addEventListener('focus', handleFocusChange);

    // Also listen to visibility change to catch edge cases where
    // focus might not fire (e.g., mobile browser tab switching)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && document.hasFocus()) {
        handleFocusChange();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleFocusChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [handleRecovery]);

  return state;
}
