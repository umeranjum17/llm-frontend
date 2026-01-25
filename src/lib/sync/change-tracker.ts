import { db, type ChangeEntry, DB_SCHEMA_VERSION } from "@/lib/db/schema";
import { getSyncedTables } from "@/lib/db/table-registry";
import { getDeviceId } from "./device-id";

// Track whether we're currently applying remote changes
// to avoid logging changes that come from sync
let isApplyingRemoteChanges = false;

// Track whether change tracking has been initialized
let isInitialized = false;

// Track consecutive failures to avoid log spam
let consecutiveFailures = 0;
const MAX_FAILURES_BEFORE_SILENCE = 3;

// Track if table has been verified to work
let tableVerified = false;

/**
 * Check if _pendingChanges table actually exists and is usable.
 * This performs a multi-layer check:
 * 1. If we've already verified writes work, trust that (fast path)
 * 2. Check DB is open
 * 3. Check IDB has the object store
 * 4. Check Dexie's internal table reference exists (catches HMR issues)
 */
function pendingChangesTableExists(): boolean {
  // Fast path: if we've already verified the table works, trust that
  if (tableVerified) return true;

  if (!db.isOpen()) return false;

  try {
    const idb = db.backendDB();
    if (!idb) return false;

    // Check that IDB has the store
    if (!idb.objectStoreNames.contains("_pendingChanges")) return false;

    // Check that Dexie's internal table reference exists
    // This catches the case where IDB has the table but Dexie's schema mapping is broken
    // (common during HMR when the module reloads but IDB connection is stale)
    if (!db._pendingChanges) return false;

    return true;
  } catch {
    return false;
  }
}

/**
 * Reset change tracker state.
 * Call this after a successful migration to re-enable change tracking.
 */
export function resetChangeTrackerState() {
  consecutiveFailures = 0;
  isInitialized = false;
  tableVerified = false;
  console.log("[ChangeTracker] State reset");
}

/**
 * Set whether we're currently applying remote changes
 * This prevents creating change logs for synced data
 */
export function setApplyingRemoteChanges(applying: boolean) {
  isApplyingRemoteChanges = applying;
}

/**
 * Queue a change to be synced later
 */
async function queueChange(
  operation: "create" | "update" | "delete",
  table: string,
  recordId: string | number | Date | ArrayBuffer | ArrayBufferView,
  data?: any,
  mods?: Record<string, any>
) {
  // Don't log changes if we're applying remote changes
  if (isApplyingRemoteChanges) {
    return;
  }

  // Check if table exists before trying to write
  if (!pendingChangesTableExists()) {
    return; // Silently skip - table not ready
  }

  try {
    const deviceId = await getDeviceId();
    const timestamp = Date.now();
    const recordIdStr = String(recordId);

    const change: ChangeEntry = {
      id: `${deviceId}-${timestamp}-${Math.random().toString(36).substring(2)}`,
      deviceId,
      timestamp,
      table,
      operation,
      recordId: recordIdStr,
      data,
      mods,
    };

    await db._pendingChanges.add(change);
    tableVerified = true;
    consecutiveFailures = 0; // Reset on success
  } catch (error) {
    // Table access failed - mark as unverified so we re-check next time
    tableVerified = false;
    consecutiveFailures++;

    // Log first few failures for debugging, then go silent to avoid spam
    if (consecutiveFailures <= MAX_FAILURES_BEFORE_SILENCE) {
      console.warn(
        `[ChangeTracker] Table access failed (${consecutiveFailures}/${MAX_FAILURES_BEFORE_SILENCE}):`,
        error instanceof Error ? error.message : error
      );
    }
  }
}

/**
 * List of tables to track for sync
 * Loaded from centralized table registry (excludes internal tables)
 */
const SYNCED_TABLES = getSyncedTables();

/**
 * Initialize change tracking hooks on all synced tables
 */
export function initializeChangeTracking() {
  // Prevent multiple initializations
  if (isInitialized) {
    console.log("[ChangeTracker] Already initialized, skipping");
    return;
  }

  console.log("[ChangeTracker] Initializing change tracking...");

  SYNCED_TABLES.forEach((tableName) => {
    const table = db.table(tableName);

    // Hook into creating
    table.hook("creating", function (primKey, obj, trans) {
      // Defer to run OUTSIDE the current transaction to avoid scope errors
      // (Hooks fire within the transaction which only includes the table being modified)
      setTimeout(() => {
        queueChange("create", tableName, primKey, obj).catch(() => {});
      }, 0);
    });

    // Hook into updating
    table.hook("updating", function (mods, primKey, obj, trans) {
      const updatedObj = { ...obj, ...mods };
      // Defer to run OUTSIDE the current transaction
      setTimeout(() => {
        queueChange("update", tableName, primKey, updatedObj, mods).catch(() => {});
      }, 0);
    });

    // Hook into deleting
    table.hook("deleting", function (primKey, obj, trans) {
      // Defer to run OUTSIDE the current transaction
      setTimeout(() => {
        queueChange("delete", tableName, primKey).catch(() => {});
      }, 0);
    });
  });

  isInitialized = true;
  console.log("[ChangeTracker] ✓ Change tracking initialized for", SYNCED_TABLES.length, "tables");
}

/**
 * Get all pending changes
 */
export async function getPendingChanges(): Promise<ChangeEntry[]> {
  if (!pendingChangesTableExists()) return [];

  try {
    return await db._pendingChanges.orderBy("timestamp").toArray();
  } catch (error) {
    console.error("[ChangeTracker] Error getting pending changes:", error);
    return [];
  }
}

/**
 * Clear all pending changes (after successful sync)
 */
export async function clearPendingChanges(): Promise<void> {
  if (!pendingChangesTableExists()) return;

  try {
    await db._pendingChanges.clear();
  } catch (error) {
    console.error("[ChangeTracker] Error clearing pending changes:", error);
  }
}

/**
 * Get pending changes count
 */
export async function getPendingChangesCount(): Promise<number> {
  if (!pendingChangesTableExists()) return 0;

  try {
    return await db._pendingChanges.count();
  } catch (error) {
    console.error("[ChangeTracker] Error counting pending changes:", error);
    return 0;
  }
}
