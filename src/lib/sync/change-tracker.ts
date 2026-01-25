import { db, type ChangeEntry } from "@/lib/db/schema";
import { getDeviceId } from "./device-id";

// Track whether we're currently applying remote changes
// to avoid logging changes that come from sync
let isApplyingRemoteChanges = false;

// Track whether change tracking has been initialized
let isInitialized = false;

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
    console.log(`[ChangeTracker] Skipping ${operation} on ${table} (applying remote changes)`);
    return;
  }

  try {
    // Check if table exists
    if (!db._pendingChanges) {
      console.warn(`[ChangeTracker] Cannot log ${operation} on ${table} - _pendingChanges table doesn't exist (migration needed)`);
      return;
    }

    const deviceId = await getDeviceId();
    const timestamp = Date.now();

    // Convert recordId to string for storage
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
    console.log(`[ChangeTracker] ✓ Logged ${operation} on ${table}/${recordIdStr}`);
  } catch (error) {
    if (error instanceof Error && error.name === "NotFoundError") {
      console.warn(`[ChangeTracker] Cannot log ${operation} on ${table} - _pendingChanges table not found (migration needed)`);
      return;
    }
    console.error("[ChangeTracker] Error queueing change:", error);
  }
}

/**
 * List of tables to track for sync
 * Exclude internal tables like _pendingChanges, _syncMeta, deviceSecrets
 */
const SYNCED_TABLES = [
  "chats",
  "messages",
  "apiKeys",
  "settings",
  "modelFavorites",
  "userMemories",
  "folders",
  "tags",
  "tagRules",
  "parameterPresets",
  "agents",
  "prompts",
  "skills",
  "skillEmbeddings",
  "workflows",
  "modelAliases",
  "mcpServers",
  "projects",
  "projectFiles",
  "contextSummaries",
];

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
    console.log(`[ChangeTracker] Registering hooks for table: ${tableName}`);

    // Hook into creating
    const createHook = table.hook("creating", function (primKey, obj, trans) {
      console.log(`[ChangeTracker] 🔵 Hook fired: creating ${tableName}/${primKey}`);
      // Queue change asynchronously but don't block the transaction
      queueChange("create", tableName, primKey, obj).catch(err =>
        console.error("[ChangeTracker] Error in creating hook:", err)
      );
    });
    console.log(`[ChangeTracker]   - creating hook registered:`, !!createHook);

    // Hook into updating
    const updateHook = table.hook("updating", function (mods, primKey, obj, trans) {
      console.log(`[ChangeTracker] 🟡 Hook fired: updating ${tableName}/${primKey}`);
      // Get the full updated object
      const updatedObj = { ...obj, ...mods };
      queueChange("update", tableName, primKey, updatedObj, mods).catch(err =>
        console.error("[ChangeTracker] Error in updating hook:", err)
      );
    });
    console.log(`[ChangeTracker]   - updating hook registered:`, !!updateHook);

    // Hook into deleting
    const deleteHook = table.hook("deleting", function (primKey, obj, trans) {
      console.log(`[ChangeTracker] 🔴 Hook fired: deleting ${tableName}/${primKey}`);
      queueChange("delete", tableName, primKey).catch(err =>
        console.error("[ChangeTracker] Error in deleting hook:", err)
      );
    });
    console.log(`[ChangeTracker]   - deleting hook registered:`, !!deleteHook);
  });

  isInitialized = true;
  console.log("[ChangeTracker] ✓ Change tracking initialized for", SYNCED_TABLES.length, "tables");
}

/**
 * Get all pending changes
 */
export async function getPendingChanges(): Promise<ChangeEntry[]> {
  try {
    if (!db._pendingChanges) {
      console.warn("[ChangeTracker] _pendingChanges table doesn't exist - returning empty array");
      return [];
    }
    return await db._pendingChanges.orderBy("timestamp").toArray();
  } catch (error) {
    if (error instanceof Error && error.name === "NotFoundError") {
      console.warn("[ChangeTracker] _pendingChanges table not found - returning empty array");
      return [];
    }
    console.error("[ChangeTracker] Error getting pending changes:", error);
    return [];
  }
}

/**
 * Clear all pending changes (after successful sync)
 */
export async function clearPendingChanges(): Promise<void> {
  try {
    if (!db._pendingChanges) {
      console.warn("[ChangeTracker] _pendingChanges table doesn't exist - cannot clear");
      return;
    }
    await db._pendingChanges.clear();
  } catch (error) {
    if (error instanceof Error && error.name === "NotFoundError") {
      console.warn("[ChangeTracker] _pendingChanges table not found - cannot clear");
      return;
    }
    console.error("[ChangeTracker] Error clearing pending changes:", error);
  }
}

/**
 * Get pending changes count
 */
export async function getPendingChangesCount(): Promise<number> {
  try {
    if (!db._pendingChanges) {
      return 0;
    }
    return await db._pendingChanges.count();
  } catch (error) {
    if (error instanceof Error && error.name === "NotFoundError") {
      return 0;
    }
    console.error("[ChangeTracker] Error counting pending changes:", error);
    return 0;
  }
}
