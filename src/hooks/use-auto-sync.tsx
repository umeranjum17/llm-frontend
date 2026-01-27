"use client";

import { useEffect, useRef } from "react";
import { getAutoSyncMode } from "@/lib/sync/device-id";
import { getSyncStatus, sync, isSyncConfigLocked } from "@/lib/sync/sync-manager";
import { generateDailySnapshot } from "@/lib/usage/snapshot-generator";

function getIntervalMs(mode: string) {
  if (mode === "5m") return 5 * 60 * 1000;
  if (mode === "15m") return 15 * 60 * 1000;
  return null;
}

export function useAutoSync() {
  const syncingRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let isMounted = true;

    const runSync = async (source: string) => {
      if (syncingRef.current) return;
      if (typeof navigator !== "undefined" && !navigator.onLine) return;

      // Skip silently if vault is locked (no error spam)
      if (isSyncConfigLocked()) return;

      const status = await getSyncStatus();
      if (!status.configured) return;

      syncingRef.current = true;
      try {
        const result = await sync();
        if (result.success) {
          // Generate daily usage snapshot after successful sync
          await generateDailySnapshot().catch(console.error);
        }
        if (process.env.NODE_ENV === "development") {
          console.log(`[AutoSync] Sync complete (${source})`);
        }
      } finally {
        syncingRef.current = false;
      }
    };

    const setupMode = async () => {
      const mode = await getAutoSyncMode();
      if (!isMounted) return;

      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      const intervalMs = getIntervalMs(mode);
      if (intervalMs) {
        intervalRef.current = setInterval(() => {
          runSync("interval");
        }, intervalMs);
      }
    };

    const handleFocus = async () => {
      const mode = await getAutoSyncMode();
      if (mode === "focus") {
        runSync("focus");
      }
    };

    setupMode();
    window.addEventListener("focus", handleFocus);
    window.addEventListener("lumina:auto-sync-updated", setupMode);

    return () => {
      isMounted = false;
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("lumina:auto-sync-updated", setupMode);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);
}
