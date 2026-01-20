"use client";

import { useEffect, useState } from "react";
import { useLoadingStore } from "@/stores/loading-store";
import { Loader2, AlertTriangle, Database } from "lucide-react";

/**
 * Full-screen overlay shown during database initialization.
 * Shows migration-specific messaging and elapsed time for long operations.
 */
export function DbInitOverlay() {
  const { isDbInitializing, dbInitMessage } = useLoadingStore();
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);

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

  if (!isDbInitializing) {
    return null;
  }

  const isMigrating = dbInitMessage?.toLowerCase().includes("migrat");
  const isTakingLong = elapsedSeconds > 10;
  const isTakingVeryLong = elapsedSeconds > 30;

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

        {/* Severe warning for very long operations */}
        {isTakingVeryLong && (
          <div className="flex flex-col items-center gap-2 text-xs text-amber-600 dark:text-amber-500">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              <span>
                {isMigrating
                  ? "Migration taking longer than expected. Please be patient."
                  : "Initialization is taking unusually long."}
              </span>
            </div>
            <p className="text-muted-foreground">
              If this persists, try refreshing the page or clearing the cache.
            </p>
          </div>
        )}

        {/* Migration-specific tips */}
        {isMigrating && (
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
