"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { db, DB_SCHEMA_VERSION } from "@/lib/db/schema";
import { toast } from "sonner";
import { RefreshCw, AlertTriangle } from "lucide-react";
import { useLoadingStore } from "@/stores/loading-store";
import { withTimeout, withTimeoutFallback } from "@/lib/utils/async-timeout";
import { operationMutex, LockKeys } from "@/lib/utils/operation-mutex";
import { broadcastToTabs, CrossTabMessages } from "@/lib/utils/cross-tab";

interface DBHealthState {
  isHealthy: boolean;
  isChecking: boolean;
  error: string | null;
  retryCount: number;
}

interface MigrationInfo {
  needed: boolean;
  fromVersion: number;
  toVersion: number;
}

/**
 * Detect if a schema migration is needed by checking the current DB version.
 * Returns version info to help determine timeout duration.
 */
async function detectMigrationNeeded(): Promise<MigrationInfo> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open("LuminaDB");

      req.onsuccess = () => {
        const currentVersion = req.result.version;
        req.result.close();
        resolve({
          needed: currentVersion > 0 && currentVersion < DB_SCHEMA_VERSION,
          fromVersion: currentVersion,
          toVersion: DB_SCHEMA_VERSION,
        });
      };

      req.onerror = () => {
        // If we can't open, assume fresh DB (no migration needed)
        resolve({ needed: false, fromVersion: 0, toVersion: DB_SCHEMA_VERSION });
      };

      // Timeout in case the open hangs
      setTimeout(() => {
        resolve({ needed: false, fromVersion: 0, toVersion: DB_SCHEMA_VERSION });
      }, 3000);
    } catch {
      resolve({ needed: false, fromVersion: 0, toVersion: DB_SCHEMA_VERSION });
    }
  });
}

/**
 * Estimate database size by counting chats (rough proxy for migration time).
 * Returns a multiplier for timeout calculation.
 */
async function estimateDbSizeFactor(): Promise<number> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open("LuminaDB");

      req.onsuccess = () => {
        const database = req.result;

        // Check if chats store exists
        if (!database.objectStoreNames.contains("chats")) {
          database.close();
          resolve(1);
          return;
        }

        const tx = database.transaction("chats", "readonly");
        const store = tx.objectStore("chats");
        const countReq = store.count();

        countReq.onsuccess = () => {
          const count = countReq.result;
          database.close();
          // Scale factor: 1x for <100 chats, up to 3x for 500+ chats
          const factor = Math.min(3, 1 + Math.floor(count / 200));
          resolve(factor);
        };

        countReq.onerror = () => {
          database.close();
          resolve(1);
        };
      };

      req.onerror = () => resolve(1);

      // Timeout in case counting hangs
      setTimeout(() => resolve(1), 2000);
    } catch {
      resolve(1);
    }
  });
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
  const retryCountRef = useRef(0);
  const maxRetries = 3;
  const setDbInitializing = useLoadingStore((state) => state.setDbInitializing);

  const clearCacheAndReload = useCallback(async () => {
    // Acquire mutex to prevent race with PWA update
    const release = await operationMutex.acquire(LockKeys.CACHE_CLEAR);

    try {
      // Clear all caches with timeouts
      if ("caches" in window) {
        const cacheNames = await withTimeoutFallback(
          caches.keys(),
          5000,
          [] as string[],
          "Get cache names"
        );

        await Promise.all(
          cacheNames.map((name) =>
            withTimeout(caches.delete(name), 5000, `Delete cache ${name}`).catch(
              (err) => console.warn(`[DB Health] Cache delete failed:`, err)
            )
          )
        );
      }

      // Unregister service workers with timeouts
      if ("serviceWorker" in navigator) {
        const registrations = await withTimeoutFallback(
          navigator.serviceWorker.getRegistrations(),
          5000,
          [] as ServiceWorkerRegistration[],
          "Get SW registrations"
        );

        await Promise.all(
          registrations.map((reg) =>
            withTimeout(reg.unregister(), 5000, "Unregister SW").catch((err) =>
              console.warn("[DB Health] Unregister failed:", err)
            )
          )
        );
      }

      // Delete IndexedDB with timeout
      if (db.isOpen()) {
        await db.close();
      }

      await withTimeout(
        new Promise<void>((resolve, reject) => {
          const deleteReq = indexedDB.deleteDatabase("LuminaDB");
          deleteReq.onsuccess = () => resolve();
          deleteReq.onerror = () => reject(deleteReq.error);
          deleteReq.onblocked = () => {
            console.warn("[DB Health] Delete blocked, waiting...");
            setTimeout(() => resolve(), 2000);
          };
        }),
        10000,
        "Delete IndexedDB"
      );

      // Reload the page
      window.location.reload();
    } catch (error) {
      console.error("[DB Health] Failed to clear cache:", error);
      toast.error("Failed to clear cache. Please manually refresh the page.");
    } finally {
      release();
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
                retryCountRef.current += 1;
                setState((prev) => ({
                  ...prev,
                  isHealthy: true,
                  isChecking: true,
                  error: null,
                  retryCount: retryCountRef.current,
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
      const currentRetryCount = retryCountRef.current;

      // Exponential backoff for retries
      if (currentRetryCount > 0 && currentRetryCount <= maxRetries) {
        const backoffMs = Math.min(1000 * Math.pow(2, currentRetryCount - 1), 5000);
        console.log(`[DB Health] Retrying in ${backoffMs}ms (attempt ${currentRetryCount + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }

      try {
        // Detect if migration is needed before opening
        const migrationInfo = await detectMigrationNeeded();
        const sizeFactor = migrationInfo.needed ? await estimateDbSizeFactor() : 1;

        // Calculate adaptive timeout:
        // - Base: 30s for normal init (increased from 5s)
        // - Migration: 60s * sizeFactor, up to 120s max
        // - Retries: additional 30s buffer
        const baseTimeout = migrationInfo.needed
          ? Math.min(120000, 60000 * sizeFactor)
          : 30000;
        const timeoutDuration = baseTimeout + (currentRetryCount > 0 ? 30000 : 0);

        // Set appropriate loading message
        let loadingMessage = "Initializing database";
        if (migrationInfo.needed) {
          loadingMessage = `Migrating database (v${migrationInfo.fromVersion} → v${migrationInfo.toVersion})`;
          console.log(`[DB Health] Migration detected: v${migrationInfo.fromVersion} → v${migrationInfo.toVersion}, sizeFactor: ${sizeFactor}, timeout: ${timeoutDuration}ms`);
        }
        if (currentRetryCount > 0) {
          loadingMessage += ` (retry ${currentRetryCount}/${maxRetries})`;
        }
        loadingMessage += "...";

        setDbInitializing(true, loadingMessage);

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

          // Notify other tabs about version change
          broadcastToTabs(CrossTabMessages.DB_VERSION_CHANGED, {
            timestamp: Date.now(),
          });

          handleRecovery(
            "versionchange",
            "Database schema changed. Please refresh to update."
          );
        });

        // Try to open the database with adaptive timeout
        const openPromise = db.open();

        timeoutId = setTimeout(() => {
          if (!isMounted) return;
          const canRetry = currentRetryCount < maxRetries;
          const migrationNote = migrationInfo.needed
            ? " Schema migration may be taking longer than expected."
            : "";
          handleRecovery(
            "timeout",
            `Database initialization timed out.${migrationNote} ${canRetry ? "Retrying..." : "This may indicate a stale cache or corrupted database."}`,
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
          retryCountRef.current = 0; // Reset on success
          setState({
            isHealthy: true,
            isChecking: false,
            error: null,
            retryCount: 0,
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
  }, [handleRecovery, setDbInitializing]);

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
