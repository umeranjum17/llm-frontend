"use client";

import { useEffect, useState, useCallback } from "react";
import { useLoadingStore } from "@/stores/loading-store";
import { Loader2, AlertTriangle, Database, Trash2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { withTimeout, withTimeoutFallback } from "@/lib/utils/async-timeout";

/**
 * Full-screen overlay shown during database initialization.
 * Shows migration-specific messaging and elapsed time for long operations.
 */
export function DbInitOverlay() {
  const { isDbInitializing, dbInitMessage } = useLoadingStore();
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [isClearing, setIsClearing] = useState(false);

  // Track elapsed time during initialization
  useEffect(() => {
    if (isDbInitializing) {
      setStartTime(Date.now());
      setElapsedSeconds(0);

      const interval = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);

      return () => {
        clearInterval(interval);
        setStartTime(null);
      };
    } else {
      setElapsedSeconds(0);
      setStartTime(null);
    }
  }, [isDbInitializing]);

  const clearPWACacheAndReload = useCallback(async () => {
    setIsClearing(true);
    try {
      // Clear all caches
      if ("caches" in window) {
        const cacheNames = await withTimeoutFallback(
          caches.keys(),
          5000,
          [] as string[],
          "Get cache names"
        );
        await Promise.all(
          cacheNames.map((name) =>
            withTimeout(caches.delete(name), 5000, `Delete cache ${name}`).catch(() => {})
          )
        );
      }

      // Unregister service workers
      if ("serviceWorker" in navigator) {
        const registrations = await withTimeoutFallback(
          navigator.serviceWorker.getRegistrations(),
          5000,
          [] as ServiceWorkerRegistration[],
          "Get SW registrations"
        );
        await Promise.all(
          registrations.map((reg) =>
            withTimeout(reg.unregister(), 5000, "Unregister SW").catch(() => {})
          )
        );
      }

      // Reload
      window.location.reload();
    } catch (error) {
      console.error("[DB Init] Failed to clear cache:", error);
      // Still try to reload
      window.location.reload();
    }
  }, []);

  if (!isDbInitializing) {
    return null;
  }

  const isMigrating = dbInitMessage?.toLowerCase().includes("migrat");
  const isTakingLong = elapsedSeconds > 10;
  const isTakingVeryLong = elapsedSeconds > 20;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/95 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-4 p-8 max-w-md text-center">
        {/* Icon */}
        <div className="relative">
          <Database className="h-12 w-12 text-muted-foreground" />
          <Loader2 className="absolute -right-2 -bottom-2 h-6 w-6 animate-spin text-primary" />
        </div>

        {/* Main message */}
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">
            {isMigrating ? "Upgrading Database" : "Initializing Database"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {dbInitMessage || "Please wait..."}
          </p>
        </div>

        {/* Elapsed time (shown after 5 seconds) */}
        {elapsedSeconds >= 5 && (
          <p className="text-xs text-muted-foreground/70">
            Elapsed: {elapsedSeconds}s
          </p>
        )}

        {/* Warning for long operations */}
        {isTakingLong && !isTakingVeryLong && (
          <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-500">
            <AlertTriangle className="h-4 w-4" />
            <span>
              {isMigrating
                ? "Large database migration in progress..."
                : "This is taking longer than usual..."}
            </span>
          </div>
        )}

        {/* Actions for very long operations */}
        {isTakingVeryLong && (
          <div className="flex flex-col items-center gap-3 mt-2">
            <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-500">
              <AlertTriangle className="h-4 w-4" />
              <span>This often happens after an app update</span>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={clearPWACacheAndReload}
                disabled={isClearing}
                className="gap-2"
              >
                {isClearing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                Clear Cache & Reload
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => window.location.reload()}
                className="gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </Button>
            </div>

            <p className="text-[11px] text-muted-foreground mt-1">
              Clearing cache won&apos;t delete your chats
            </p>
          </div>
        )}

        {/* Migration-specific tips */}
        {isMigrating && !isTakingVeryLong && (
          <div className="mt-4 p-3 rounded-lg bg-muted/50 text-xs text-muted-foreground">
            <p>
              Your database is being upgraded to a new version.
              This is a one-time process that ensures compatibility
              with the latest app features.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
