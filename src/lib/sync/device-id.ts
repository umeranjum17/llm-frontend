import { db } from "@/lib/db/schema";
import {
  decryptApiKey,
  encryptApiKey,
  initializeDeviceSecret,
  isEncryptedKey,
} from "@/lib/crypto/api-key-crypto";
import { useApiKeysStore, type S3SyncConfig, SYNC_S3_PROVIDER } from "@/stores/api-keys-store";

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

function inferDeviceName(): string {
  if (typeof navigator === "undefined") return "Device";
  const ua = navigator.userAgent || "";
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  if (/Android/i.test(ua)) return "Android device";
  if (/Mac/i.test(ua)) return "Mac";
  if (/Windows/i.test(ua)) return "Windows PC";
  if (/Linux/i.test(ua)) return "Linux device";
  return "Device";
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
      autoSyncMode: meta?.autoSyncMode,
      deviceName: meta?.deviceName,
    });
    tableVerified = true;
  } catch {
    tableVerified = false;
    // Silently ignore
  }
}

export async function getDeviceName(): Promise<string> {
  if (!syncMetaTableExists()) return "Device";
  try {
    const meta = await db._syncMeta.get("default");
    tableVerified = true;
    if (meta?.deviceName) return meta.deviceName;

    const deviceName = inferDeviceName();
    const deviceId = await getDeviceId();
    await db._syncMeta.put({
      id: "default",
      deviceId,
      lastSyncAt: meta?.lastSyncAt || 0,
      s3Config: meta?.s3Config,
      autoSyncMode: meta?.autoSyncMode,
      deviceName,
    });
    return deviceName;
  } catch {
    tableVerified = false;
    return "Device";
  }
}

export async function setDeviceName(deviceName: string): Promise<void> {
  if (!syncMetaTableExists()) return;
  try {
    const deviceId = await getDeviceId();
    const meta = await db._syncMeta.get("default");
    await db._syncMeta.put({
      id: "default",
      deviceId,
      lastSyncAt: meta?.lastSyncAt || 0,
      s3Config: meta?.s3Config,
      autoSyncMode: meta?.autoSyncMode,
      deviceName,
    });
    tableVerified = true;
  } catch {
    tableVerified = false;
  }
}

export type AutoSyncMode = "manual" | "focus" | "5m" | "15m";

export async function getAutoSyncMode(): Promise<AutoSyncMode> {
  if (!syncMetaTableExists()) return "manual";
  try {
    const meta = await db._syncMeta.get("default");
    tableVerified = true;
    return (meta?.autoSyncMode as AutoSyncMode) || "manual";
  } catch {
    tableVerified = false;
    return "manual";
  }
}

export async function setAutoSyncMode(mode: AutoSyncMode): Promise<void> {
  if (!syncMetaTableExists()) return;
  try {
    const deviceId = await getDeviceId();
    const meta = await db._syncMeta.get("default");
    await db._syncMeta.put({
      id: "default",
      deviceId,
      lastSyncAt: meta?.lastSyncAt || 0,
      s3Config: meta?.s3Config,
      autoSyncMode: mode,
      deviceName: meta?.deviceName,
    });
    tableVerified = true;
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("lumina:auto-sync-updated", { detail: { mode } }));
    }
  } catch {
    tableVerified = false;
  }
}

/**
 * Get S3 configuration for sync.
 * Now reads from the API keys store (sync-s3 provider) for unified vault protection.
 */
export function getS3Config(): S3SyncConfig | null {
  const store = useApiKeysStore.getState();

  // First try the new API keys store
  const config = store.getS3Config();
  if (config) return config;

  // If not in store yet, return null (migration happens on load)
  return null;
}

/**
 * Check if S3 config exists but is locked behind the vault
 */
export function isS3ConfigLocked(): boolean {
  const store = useApiKeysStore.getState();
  return store.isS3ConfigLocked();
}

/**
 * Set S3 configuration for sync.
 * Now stores in the API keys store (sync-s3 provider) for unified vault protection.
 */
export async function setS3Config(config: S3SyncConfig): Promise<void> {
  const store = useApiKeysStore.getState();
  await store.setS3Config(config);
}

/**
 * Remove S3 configuration
 */
export async function removeS3Config(): Promise<void> {
  const store = useApiKeysStore.getState();
  await store.removeS3Config();
}

/**
 * Migrate old S3 config from _syncMeta to API keys store.
 * Called during app initialization when vault is unlocked.
 */
export async function migrateS3ConfigToVault(): Promise<boolean> {
  if (!syncMetaTableExists()) return false;

  const store = useApiKeysStore.getState();

  // Skip if already migrated (config exists in store)
  if (store.isS3ConfigAvailable()) return false;

  // Skip if vault is locked (defer migration)
  if (store.vault.meta && !store.vault.isUnlocked) return false;

  try {
    const meta = await db._syncMeta.get("default");
    if (!meta?.s3Config) return false;

    // Decrypt old config
    const oldConfig = meta.s3Config;
    let decryptedConfig: S3SyncConfig;

    const accessKeyEncrypted = isEncryptedKey(oldConfig.accessKeyId);
    const secretEncrypted = isEncryptedKey(oldConfig.secretAccessKey);

    if (accessKeyEncrypted || secretEncrypted) {
      await initializeDeviceSecret();
      decryptedConfig = {
        endpoint: oldConfig.endpoint,
        bucket: oldConfig.bucket,
        region: oldConfig.region,
        accessKeyId: accessKeyEncrypted
          ? await decryptApiKey(oldConfig.accessKeyId)
          : oldConfig.accessKeyId,
        secretAccessKey: secretEncrypted
          ? await decryptApiKey(oldConfig.secretAccessKey)
          : oldConfig.secretAccessKey,
      };
    } else {
      decryptedConfig = oldConfig;
    }

    // Save to new location (API keys store)
    await store.setS3Config(decryptedConfig);

    // Clear old location
    const deviceId = await getDeviceId();
    await db._syncMeta.put({
      id: "default",
      deviceId,
      lastSyncAt: meta.lastSyncAt || 0,
      s3Config: undefined, // Clear old config
      autoSyncMode: meta.autoSyncMode,
      deviceName: meta.deviceName,
    });

    console.log("[S3Config] Migrated to API keys vault");
    return true;
  } catch (error) {
    console.warn("[S3Config] Migration failed:", error);
    return false;
  }
}
