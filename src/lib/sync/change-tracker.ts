import { db, type ChangeEntry } from "@/lib/db/schema";
import { getDeviceId } from "./device-id";

// Track whether we're currently applying remote changes
// to avoid logging changes that come from sync
let isApplyingRemoteChanges = false;

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

  try {
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
  } catch (error) {
    console.error("Error queueing change:", error);
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
  SYNCED_TABLES.forEach((tableName) => {
    const table = db.table(tableName);

    // Hook into creating
    table.hook("creating", function (primKey, obj) {
      queueChange("create", tableName, primKey, obj);
    });

    // Hook into updating
    table.hook("updating", function (mods, primKey, obj) {
      // Get the full updated object
      const updatedObj = { ...obj, ...mods };
      queueChange("update", tableName, primKey, updatedObj, mods);
    });

    // Hook into deleting
    table.hook("deleting", function (primKey) {
      queueChange("delete", tableName, primKey);
    });
  });

  console.log("Change tracking initialized for", SYNCED_TABLES.length, "tables");
}

/**
 * Get all pending changes
 */
export async function getPendingChanges(): Promise<ChangeEntry[]> {
  return db._pendingChanges.orderBy("timestamp").toArray();
}

/**
 * Clear all pending changes (after successful sync)
 */
export async function clearPendingChanges(): Promise<void> {
  await db._pendingChanges.clear();
}

/**
 * Get pending changes count
 */
export async function getPendingChangesCount(): Promise<number> {
  return db._pendingChanges.count();
}
