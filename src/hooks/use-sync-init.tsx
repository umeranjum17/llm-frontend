import { useEffect } from "react";
import { initializeChangeTracking, resetChangeTrackerState } from "@/lib/sync";
import { db } from "@/lib/db/schema";

/**
 * Check if the _pendingChanges object store actually exists in IndexedDB.
 * Uses raw IndexedDB API instead of Dexie wrapper (which can mask missing stores).
 */
function pendingChangesTableExists(): boolean {
  const idb = db.backendDB();
  if (!idb) return false;
  return idb.objectStoreNames.contains("_pendingChanges");
}

/**
 * Initialize delta sync change tracking on app startup.
 * Waits for database to be ready before initializing hooks.
 */
export function useSyncInit() {
  useEffect(() => {
    const initWithDbReady = async () => {
      try {
        // Wait for DB to be open and ready
        if (!db.isOpen()) {
          console.log("[Sync] Waiting for database to open...");
          await db.open();
        }

        // Verify the _pendingChanges table actually exists in IndexedDB
        // Use raw IndexedDB API - Dexie's wrapper can succeed even with missing stores
        if (!pendingChangesTableExists()) {
          console.warn("[Sync] _pendingChanges table not found in IndexedDB - waiting for migration...");

          // Wait for migration to complete (up to 5 seconds)
          for (let i = 0; i < 10; i++) {
            await new Promise((resolve) => setTimeout(resolve, 500));
            if (pendingChangesTableExists()) {
              console.log("[Sync] _pendingChanges table now exists after migration");
              break;
            }
          }

          // Final check
          if (!pendingChangesTableExists()) {
            console.error("[Sync] _pendingChanges table still missing after waiting. Migration may have failed.");
            console.error("[Sync] Available stores:", Array.from(db.backendDB()?.objectStoreNames || []));
            return; // Don't initialize if table doesn't exist
          }
        }

        console.log("[Sync] _pendingChanges table verified");

        // Reset any previous state (in case table was missing before migration)
        resetChangeTrackerState();

        initializeChangeTracking();
        console.log("[Sync] Change tracking initialized successfully");
      } catch (error) {
        console.error("[Sync] Failed to initialize change tracking:", error);
      }
    };

    initWithDbReady();
  }, []);
}
