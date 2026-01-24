"use client";

import { useEffect, useState, useCallback } from "react";
import { useLoadingStore } from "@/stores/loading-store";
import { Loader2, Database, RefreshCw } from "lucide-react";
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
  const [isRefreshing, setIsRefreshing] = useState(false);

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

  /**
   * Tier 1: Soft Refresh - Preserves all user data
   * Clears service worker caches and registrations only.
   */
  const softRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      // Clear all SW caches
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
          registrations.map(async (reg) => {
            try {
              await reg.update();
            } catch {}
            await withTimeout(reg.unregister(), 5000, "Unregister SW").catch(() => {});
          })
        );
      }

      // Hard reload with cache buster
      const url = new URL(window.location.href);
      url.searchParams.set("_refresh", Date.now().toString());
      window.location.href = url.toString();
    } catch (error) {
      console.error("[DB Init] Soft refresh failed:", error);
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

        {/* Show recovery option after 5 seconds */}
        {showButtons && (
          <div className="flex flex-col items-center gap-2 mt-2">
            <Button
              variant="default"
              size="sm"
              onClick={softRefresh}
              disabled={isRefreshing}
              className="gap-2"
            >
              {isRefreshing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Refresh App
            </Button>
            <p className="text-xs text-muted-foreground">
              Clears browser cache only. Your data is safe.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
