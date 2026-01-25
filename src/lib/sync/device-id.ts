import { db } from "@/lib/db/schema";

let tempDeviceId: string | null = null;

// Track if table has been verified to work
let tableVerified = false;

/**
 * Check if _syncMeta table exists and is usable.
 * This performs a multi-layer check:
 * 1. If we've already verified writes work, trust that (fast path)
 * 2. Check DB is open
 * 3. Check IDB has the object store
 * 4. Check Dexie's internal table reference exists (catches HMR issues)
 */
function syncMetaTableExists(): boolean {
  // Fast path: if we've already verified the table works, trust that
  if (tableVerified) return true;

  if (!db.isOpen()) return false;

  try {
    const idb = db.backendDB();
    if (!idb) return false;

    // Check that IDB has the store
    if (!idb.objectStoreNames.contains("_syncMeta")) return false;

    // Check that Dexie's internal table reference exists
    // This catches the case where IDB has the table but Dexie's schema mapping is broken
    // (common during HMR when the module reloads but IDB connection is stale)
    if (!db._syncMeta) return false;

    return true;
  } catch {
    return false;
  }
}

/**
 * Generate or retrieve a persistent device ID for this browser/device.
 * Stored in the _syncMeta table to persist across sessions.
 */
export async function getDeviceId(): Promise<string> {
  // Always have a temp ID ready
  if (!tempDeviceId) {
    tempDeviceId = `temp-device-${Date.now()}`;
  }

  // Check if table actually exists before trying to use it
  if (!syncMetaTableExists()) {
    return tempDeviceId;
  }

  try {
    const meta = await db._syncMeta.get("default");

    if (meta?.deviceId) {
      tableVerified = true;
      return meta.deviceId;
    }

    // Generate new device ID
    const deviceId = generateDeviceId();

    // Store it
    await db._syncMeta.put({
      id: "default",
      deviceId,
      lastSyncAt: 0,
    });

    tableVerified = true;
    return deviceId;
  } catch {
    // Table access failed - mark as unverified for next check
    tableVerified = false;
    return tempDeviceId;
  }
}

/**
 * Generate a unique device ID based on timestamp and random values
 */
function generateDeviceId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 15);
  return `device-${timestamp}-${random}`;
}

/**
 * Reset device ID state.
 * Call this after a successful migration to re-enable sync meta access.
 */
export function resetDeviceIdState() {
  tableVerified = false;
  console.log("[DeviceId] State reset");
}

/**
 * Get the last sync timestamp for this device
 */
export async function getLastSyncTime(): Promise<number> {
  if (!syncMetaTableExists()) return 0;
  try {
    const meta = await db._syncMeta.get("default");
    tableVerified = true;
    return meta?.lastSyncAt || 0;
  } catch {
    tableVerified = false;
    return 0;
  }
}

/**
 * Update the last sync timestamp
 */
export async function setLastSyncTime(timestamp: number): Promise<void> {
  if (!syncMetaTableExists()) return;
  try {
    const deviceId = await getDeviceId();
    const meta = await db._syncMeta.get("default");
    await db._syncMeta.put({
      id: "default",
      deviceId,
      lastSyncAt: timestamp,
      s3Config: meta?.s3Config,
    });
    tableVerified = true;
  } catch {
    tableVerified = false;
    // Silently ignore
  }
}

/**
 * Get S3 configuration for sync
 */
export async function getS3Config() {
  if (!syncMetaTableExists()) return undefined;
  try {
    const meta = await db._syncMeta.get("default");
    tableVerified = true;
    return meta?.s3Config;
  } catch {
    tableVerified = false;
    return undefined;
  }
}

/**
 * Set S3 configuration for sync
 */
export async function setS3Config(config: {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  region?: string;
}) {
  if (!syncMetaTableExists()) {
    throw new Error("Database not ready. Please hard refresh (Ctrl+Shift+R).");
  }

  try {
    const deviceId = await getDeviceId();
    const meta = await db._syncMeta.get("default");
    await db._syncMeta.put({
      id: "default",
      deviceId,
      lastSyncAt: meta?.lastSyncAt || 0,
      s3Config: config,
    });
    tableVerified = true;
  } catch (error) {
    tableVerified = false;
    throw new Error("Failed to save sync config. Please hard refresh and try again.");
  }
}
