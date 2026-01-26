import { getDeviceId, getLastSyncTime, setLastSyncTime } from "./device-id";
import { getPendingChanges, clearPendingChanges } from "./change-tracker";
import { S3Adapter } from "./s3-adapter";
import { applyChanges } from "./apply-change";
import { getSyncedTables } from "@/lib/db/table-registry";

export interface SyncResult {
  success: boolean;
  uploaded: number;
  downloaded: number;
  applied: number;
  failed: number;
  error?: string;
  timestamp: number;
}

export interface SyncProgress {
  phase: "uploading" | "downloading" | "applying" | "complete";
  message: string;
  uploaded?: number;
  downloaded?: number;
  applied?: number;
}

/**
 * Main sync function - orchestrates the delta sync process
 */
export async function sync(
  onProgress?: (progress: SyncProgress) => void
): Promise<SyncResult> {
  const startTime = Date.now();
  const syncedTables = new Set(getSyncedTables());

  try {
    // 1. Get device ID
    const deviceId = await getDeviceId();

    // 2. Get S3 adapter
    const s3 = await S3Adapter.fromConfig();
    if (!s3) {
      return {
        success: false,
        uploaded: 0,
        downloaded: 0,
        applied: 0,
        failed: 0,
        error: "S3 not configured. Please configure sync settings first.",
        timestamp: startTime,
      };
    }

    // 3. Get pending local changes
    onProgress?.({
      phase: "uploading",
      message: "Collecting local changes...",
    });

    const localChanges = await getPendingChanges();
    const localSyncedChanges = localChanges.filter((c) => syncedTables.has(c.table));
    const droppedLocal = localChanges.length - localSyncedChanges.length;
    if (droppedLocal > 0) {
      console.warn(`[SyncManager] Dropping ${droppedLocal} pending changes for non-synced tables`);
    }
    console.log(`[SyncManager] Found ${localSyncedChanges.length} pending local changes`);

    // 4. Upload local changes to S3
    if (localSyncedChanges.length > 0) {
      onProgress?.({
        phase: "uploading",
        message: `Uploading ${localSyncedChanges.length} changes...`,
        uploaded: localSyncedChanges.length,
      });

      await s3.uploadChanges(deviceId, localSyncedChanges);
    }

    // 5. Download remote changes
    onProgress?.({
      phase: "downloading",
      message: "Downloading remote changes...",
    });

    const lastSyncTime = await getLastSyncTime();
    const remoteChanges = await s3.downloadChanges(lastSyncTime);

    // Filter out changes from this device
    const otherDeviceChanges = remoteChanges
      .filter((change) => change.deviceId !== deviceId)
      .filter((change) => syncedTables.has(change.table));

    onProgress?.({
      phase: "downloading",
      message: `Downloaded ${otherDeviceChanges.length} changes from other devices`,
      downloaded: otherDeviceChanges.length,
    });

    // 6. Apply remote changes
    onProgress?.({
      phase: "applying",
      message: "Applying remote changes...",
    });

    const applyResult = await applyChanges(otherDeviceChanges);

    if (applyResult.errors.length > 0) {
      console.error("Errors applying changes:", applyResult.errors);
    }

    // 7. Clear pending changes and update sync time
    await clearPendingChanges();
    await setLastSyncTime(Date.now());

    // 8. Update manifest
    const manifest = await s3.getManifest();
    manifest.devices[deviceId] = {
      lastChangeId:
        localSyncedChanges[localSyncedChanges.length - 1]?.id || `${deviceId}-${Date.now()}`,
      lastSyncAt: Date.now(),
    };
    await s3.updateManifest(manifest);

    onProgress?.({
      phase: "complete",
      message: "Sync complete",
      uploaded: localSyncedChanges.length,
      downloaded: otherDeviceChanges.length,
      applied: applyResult.applied,
    });

    return {
      success: true,
      uploaded: localSyncedChanges.length,
      downloaded: otherDeviceChanges.length,
      applied: applyResult.applied,
      failed: applyResult.failed,
      timestamp: startTime,
    };
  } catch (error) {
    console.error("Sync error:", error);
    return {
      success: false,
      uploaded: 0,
      downloaded: 0,
      applied: 0,
      failed: 0,
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp: startTime,
    };
  }
}

/**
 * Check if sync is configured
 */
export async function isSyncConfigured(): Promise<boolean> {
  const s3 = await S3Adapter.fromConfig();
  const isConfigured = s3 !== null;
  console.log("[SyncManager] isSyncConfigured:", isConfigured);
  return isConfigured;
}

/**
 * Get sync status
 */
export async function getSyncStatus(): Promise<{
  configured: boolean;
  deviceId: string;
  lastSyncAt: number;
  pendingChanges: number;
}> {
  const deviceId = await getDeviceId();
  const configured = await isSyncConfigured();
  const lastSyncAt = await getLastSyncTime();
  const pendingChanges = (await getPendingChanges()).length;

  return {
    configured,
    deviceId,
    lastSyncAt,
    pendingChanges,
  };
}
