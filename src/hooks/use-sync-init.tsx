import { useEffect } from "react";
import { initializeChangeTracking } from "@/lib/sync";

/**
 * Initialize delta sync change tracking on app startup
 */
export function useSyncInit() {
  useEffect(() => {
    try {
      initializeChangeTracking();
      console.log("[Sync] Change tracking initialized");
    } catch (error) {
      console.error("[Sync] Failed to initialize change tracking:", error);
    }
  }, []);
}
