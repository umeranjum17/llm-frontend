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
  const showButtons = elapsedSeconds >= 5;

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

        {/* Show buttons after 5 seconds */}
        {showButtons && (
          <div className="flex flex-col items-center gap-3 mt-2">
            <p className="text-xs text-muted-foreground">
              {isMigrating
                ? "If this takes too long, try clearing cache"
                : "Stuck? This often happens after an app update"}
            </p>

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

            <p className="text-[11px] text-muted-foreground">
              Your chats are stored safely in IndexedDB
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
