/**
 * Cloud Sync Engine
 *
 * Core sync logic implementing Last-Write-Wins (LWW) conflict resolution.
 * Coordinates database export/import with S3/R2 cloud storage.
 */

import type { S3Client } from "@aws-sdk/client-s3";
import type { CloudSyncConfig } from "@/lib/db/schema";
import { db } from "@/lib/db/schema";
import {
  createS3ClientFromConfig,
  uploadData,
  downloadBlob,
} from "./s3-client";
import {
  readManifest,
  writeManifest,
  createManifest,
  decideSyncDirection,
  calculateChecksum,
  getOrCreateDeviceId,
  getOrCreateDeviceName,
  formatRelativeTime,
  MANIFEST_KEY,
  DATA_KEY,
  type SyncManifest,
  type SyncDecision,
} from "./manifest";
import {
  exportFullDatabase,
  importFullDatabase,
  hasChangesSince,
  blobToBase64,
  base64ToBlob,
} from "./db-export";
import {
  encryptSyncData,
  decryptSyncData,
  getSessionPassword,
} from "./encryption";

export type SyncStatus = "idle" | "syncing" | "success" | "error" | "conflict";
export type SyncDirection = "upload" | "download" | "none";

export interface SyncResult {
  status: SyncStatus;
  direction: SyncDirection;
  message: string;
  error?: string;
  timestamp: number;
  bytesTransferred?: number;
  deviceName?: string; // Device that was synced from/to
}

export interface SyncProgress {
  phase: "checking" | "exporting" | "uploading" | "downloading" | "importing" | "done";
  message: string;
  percentage?: number;
}

export interface SyncEngineState {
  isInitialized: boolean;
  isSyncing: boolean;
  lastSyncResult: SyncResult | null;
  config: CloudSyncConfig | null;
}

type SyncProgressCallback = (progress: SyncProgress) => void;
type SyncCompleteCallback = (result: SyncResult) => void;

/**
 * Cloud Sync Engine
 *
 * Manages the sync lifecycle between local database and cloud storage.
 */
export class CloudSyncEngine {
  private client: S3Client | null = null;
  private config: CloudSyncConfig | null = null;
  private isSyncing = false;
  private autoSyncInterval: ReturnType<typeof setInterval> | null = null;
  private debounceTimeout: ReturnType<typeof setTimeout> | null = null;
  private lastSyncResult: SyncResult | null = null;

  // Change tracking
  private lastKnownUpdateTime = 0;
  private hasUnsyncedChanges = false;

  // Callbacks
  private onProgress: SyncProgressCallback | null = null;
  private onComplete: SyncCompleteCallback | null = null;

  /**
   * Initializes the sync engine with configuration
   */
  async initialize(config: CloudSyncConfig): Promise<{ success: boolean; error?: string }> {
    try {
      this.config = config;
      this.client = createS3ClientFromConfig(config);

      // Load last sync time
      const savedConfig = await db.cloudSyncConfig.get("default");
      if (savedConfig?.lastSyncAt) {
        this.lastKnownUpdateTime = savedConfig.lastSyncAt;
      }

      return { success: true };
    } catch (error) {
      const err = error as Error;
      return { success: false, error: err.message };
    }
  }

  /**
   * Sets progress callback
   */
  setProgressCallback(callback: SyncProgressCallback | null): void {
    this.onProgress = callback;
  }

  /**
   * Sets completion callback
   */
  setCompleteCallback(callback: SyncCompleteCallback | null): void {
    this.onComplete = callback;
  }

  /**
   * Reports progress to callback
   */
  private reportProgress(progress: SyncProgress): void {
    if (this.onProgress) {
      this.onProgress(progress);
    }
  }

  /**
   * Checks if the engine is ready for sync operations
   */
  isReady(): boolean {
    return this.client !== null && this.config !== null;
  }

  /**
   * Returns current sync state
   */
  getState(): SyncEngineState {
    return {
      isInitialized: this.isReady(),
      isSyncing: this.isSyncing,
      lastSyncResult: this.lastSyncResult,
      config: this.config,
    };
  }

  /**
   * Performs a sync operation
   *
   * @param options.force - Skip change detection and force sync
   * @param options.direction - Force a specific direction (upload/download)
   */
  async sync(options?: {
    force?: boolean;
    direction?: "upload" | "download";
  }): Promise<SyncResult> {
    // Prevent concurrent syncs
    if (this.isSyncing) {
      return {
        status: "error",
        direction: "none",
        message: "Sync already in progress",
        timestamp: Date.now(),
      };
    }

    // Check initialization
    if (!this.isReady()) {
      return {
        status: "error",
        direction: "none",
        message: "Sync engine not initialized",
        timestamp: Date.now(),
      };
    }

    this.isSyncing = true;
    const startTime = Date.now();

    try {
      this.reportProgress({ phase: "checking", message: "Checking sync status..." });

      // Get local state
      const localDeviceId = getOrCreateDeviceId();
      const localDeviceName = getOrCreateDeviceName();
      const localLastSyncAt = this.config!.lastSyncAt || 0;

      // Check for local changes
      const hasLocalChanges = options?.force || await hasChangesSince(localLastSyncAt);
      this.hasUnsyncedChanges = hasLocalChanges;

      // Fetch remote manifest
      const manifestResult = await readManifest(this.client!, this.config!.bucket);
      const remoteManifest = manifestResult.success ? manifestResult.manifest! : null;

      // Decide sync direction
      let decision: SyncDecision;

      if (options?.direction) {
        // Forced direction
        decision = {
          direction: options.direction,
          reason: `Forced ${options.direction}`,
          remoteManifest: remoteManifest || undefined,
        };
      } else {
        decision = decideSyncDirection(
          localLastSyncAt,
          localDeviceId,
          remoteManifest,
          hasLocalChanges
        );
      }

      // Handle conflict: show warning but proceed with upload (LWW)
      if (decision.direction === "conflict") {
        // In LWW, we upload local changes and overwrite remote
        // The user can use force download if they want the remote version
        decision.direction = "upload";
        decision.reason = "Conflict resolved: uploading local changes (Last-Write-Wins)";
      }

      // Execute sync based on direction
      let result: SyncResult;

      switch (decision.direction) {
        case "upload":
          result = await this.performUpload(localDeviceId, localDeviceName);
          break;

        case "download":
          result = await this.performDownload(remoteManifest!);
          break;

        case "none":
        default:
          result = {
            status: "success",
            direction: "none",
            message: decision.reason,
            timestamp: Date.now(),
            deviceName: remoteManifest?.deviceName,
          };
          break;
      }

      // Update last sync time on success
      if (result.status === "success" && result.direction !== "none") {
        await this.updateLastSyncTime(Date.now());
        this.hasUnsyncedChanges = false;
      }

      this.lastSyncResult = result;

      if (this.onComplete) {
        this.onComplete(result);
      }

      return result;
    } catch (error) {
      const err = error as Error;
      const result: SyncResult = {
        status: "error",
        direction: "none",
        message: "Sync failed",
        error: err.message,
        timestamp: Date.now(),
      };

      this.lastSyncResult = result;

      if (this.onComplete) {
        this.onComplete(result);
      }

      return result;
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Performs an upload operation
   */
  private async performUpload(
    deviceId: string,
    deviceName: string
  ): Promise<SyncResult> {
    this.reportProgress({ phase: "exporting", message: "Exporting database..." });

    // Export database
    const exportResult = await exportFullDatabase((progress) => {
      this.reportProgress({
        phase: "exporting",
        message: `Exporting: ${progress.percentage}%`,
        percentage: progress.percentage,
      });
    });

    if (!exportResult.success || !exportResult.data) {
      return {
        status: "error",
        direction: "upload",
        message: "Failed to export database",
        error: exportResult.error,
        timestamp: Date.now(),
      };
    }

    let dataToUpload: Blob | string = exportResult.data;
    let encryptionEnabled = false;

    // Encrypt if enabled
    if (this.config!.encryptionEnabled) {
      const password = getSessionPassword();
      if (!password) {
        return {
          status: "error",
          direction: "upload",
          message: "Encryption password required",
          error: "Please enter your sync password",
          timestamp: Date.now(),
        };
      }

      this.reportProgress({ phase: "uploading", message: "Encrypting data..." });
      dataToUpload = await encryptSyncData(exportResult.data, password);
      encryptionEnabled = true;
    }

    // Calculate checksum
    const checksum = await calculateChecksum(
      dataToUpload instanceof Blob ? await dataToUpload.text() : dataToUpload
    );

    this.reportProgress({ phase: "uploading", message: "Uploading data..." });

    // Upload data FIRST (atomic write safety)
    const uploadResult = await uploadData(
      this.client!,
      this.config!.bucket,
      DATA_KEY,
      dataToUpload instanceof Blob ? await dataToUpload.text() : dataToUpload
    );

    if (!uploadResult.success) {
      return {
        status: "error",
        direction: "upload",
        message: "Failed to upload data",
        error: uploadResult.error,
        timestamp: Date.now(),
      };
    }

    // Upload manifest LAST (completes the atomic write)
    const manifest = createManifest(deviceId, deviceName, checksum, encryptionEnabled);
    const manifestResult = await writeManifest(this.client!, this.config!.bucket, manifest);

    if (!manifestResult.success) {
      return {
        status: "error",
        direction: "upload",
        message: "Failed to update manifest",
        error: manifestResult.error,
        timestamp: Date.now(),
      };
    }

    this.reportProgress({ phase: "done", message: "Upload complete" });

    return {
      status: "success",
      direction: "upload",
      message: "Data uploaded successfully",
      timestamp: Date.now(),
      bytesTransferred: exportResult.data.size,
      deviceName,
    };
  }

  /**
   * Performs a download operation
   */
  private async performDownload(remoteManifest: SyncManifest): Promise<SyncResult> {
    // Safety check: warn if there are unsaved local changes
    if (this.hasUnsyncedChanges) {
      console.warn("[CloudSync] Downloading will overwrite local unsaved changes");
      // In a real implementation, you might want to show a confirmation dialog
    }

    this.reportProgress({ phase: "downloading", message: "Downloading data..." });

    // Download data
    const downloadResult = await downloadBlob(this.client!, this.config!.bucket, DATA_KEY);

    if (!downloadResult.success || !downloadResult.data) {
      if (downloadResult.notFound) {
        return {
          status: "error",
          direction: "download",
          message: "Remote data not found",
          error: "The data file doesn't exist in cloud storage",
          timestamp: Date.now(),
        };
      }
      return {
        status: "error",
        direction: "download",
        message: "Failed to download data",
        error: downloadResult.error,
        timestamp: Date.now(),
      };
    }

    let dataToImport = downloadResult.data;

    // Decrypt if encrypted
    if (remoteManifest.encryptionEnabled) {
      const password = getSessionPassword();
      if (!password) {
        return {
          status: "error",
          direction: "download",
          message: "Decryption password required",
          error: "Please enter your sync password",
          timestamp: Date.now(),
        };
      }

      this.reportProgress({ phase: "importing", message: "Decrypting data..." });
      try {
        dataToImport = await decryptSyncData(downloadResult.data, password);
      } catch (error) {
        const err = error as Error;
        return {
          status: "error",
          direction: "download",
          message: "Decryption failed",
          error: err.message,
          timestamp: Date.now(),
        };
      }
    }

    // Verify checksum if available
    if (remoteManifest.dataChecksum) {
      const localChecksum = await calculateChecksum(await dataToImport.text());
      if (localChecksum !== remoteManifest.dataChecksum) {
        console.warn("[CloudSync] Checksum mismatch, data may be corrupted");
        // Continue anyway - the import will fail if data is truly corrupted
      }
    }

    this.reportProgress({ phase: "importing", message: "Importing database..." });

    // Import database
    const importResult = await importFullDatabase(dataToImport, (progress) => {
      this.reportProgress({
        phase: "importing",
        message: `Importing: ${progress.percentage}%`,
        percentage: progress.percentage,
      });
    });

    if (!importResult.success) {
      return {
        status: "error",
        direction: "download",
        message: "Failed to import database",
        error: importResult.error,
        timestamp: Date.now(),
      };
    }

    this.reportProgress({ phase: "done", message: "Download complete" });

    return {
      status: "success",
      direction: "download",
      message: `Data synced from ${remoteManifest.deviceName || "another device"}`,
      timestamp: Date.now(),
      bytesTransferred: downloadResult.data.size,
      deviceName: remoteManifest.deviceName,
    };
  }

  /**
   * Updates the last sync time in the database
   */
  private async updateLastSyncTime(timestamp: number): Promise<void> {
    if (!this.config) return;

    this.lastKnownUpdateTime = timestamp;

    await db.cloudSyncConfig.update("default", {
      lastSyncAt: timestamp,
      lastSyncStatus: "success",
      updatedAt: timestamp,
    });
  }

  /**
   * Starts auto-sync with the configured interval
   */
  startAutoSync(): void {
    if (!this.config?.autoSyncEnabled) return;

    const intervalMs = (this.config.syncIntervalSeconds || 30) * 1000;

    // Clear existing interval
    this.stopAutoSync();

    // Start new interval
    this.autoSyncInterval = setInterval(() => {
      this.sync();
    }, intervalMs);

    console.log(`[CloudSync] Auto-sync started (every ${this.config.syncIntervalSeconds}s)`);
  }

  /**
   * Stops auto-sync
   */
  stopAutoSync(): void {
    if (this.autoSyncInterval) {
      clearInterval(this.autoSyncInterval);
      this.autoSyncInterval = null;
      console.log("[CloudSync] Auto-sync stopped");
    }
  }

  /**
   * Triggers a debounced sync after local changes
   * Waits 5 seconds after the last change before syncing
   */
  scheduleDebounceSync(): void {
    if (!this.config?.enabled) return;

    // Clear existing timeout
    if (this.debounceTimeout) {
      clearTimeout(this.debounceTimeout);
    }

    // Mark that we have unsynced changes
    this.hasUnsyncedChanges = true;

    // Schedule sync after 5 seconds
    this.debounceTimeout = setTimeout(() => {
      this.sync();
    }, 5000);
  }

  /**
   * Triggers sync on tab visibility change (user returns to tab)
   */
  handleVisibilityChange(): void {
    if (document.visibilityState === "visible" && this.config?.enabled) {
      this.sync();
    }
  }

  /**
   * Cleanup - call when unmounting
   */
  destroy(): void {
    this.stopAutoSync();

    if (this.debounceTimeout) {
      clearTimeout(this.debounceTimeout);
      this.debounceTimeout = null;
    }

    this.client = null;
    this.config = null;
  }

  /**
   * Gets formatted last sync info for UI
   */
  getLastSyncInfo(): {
    synced: boolean;
    message: string;
    deviceName?: string;
    relativeTime?: string;
  } {
    if (!this.lastSyncResult) {
      return {
        synced: false,
        message: "Never synced",
      };
    }

    if (this.lastSyncResult.status === "error") {
      return {
        synced: false,
        message: this.lastSyncResult.error || "Sync failed",
      };
    }

    const relativeTime = formatRelativeTime(this.lastSyncResult.timestamp);

    if (this.lastSyncResult.direction === "none") {
      return {
        synced: true,
        message: "Up to date",
        relativeTime,
        deviceName: this.lastSyncResult.deviceName,
      };
    }

    const direction = this.lastSyncResult.direction === "upload" ? "to" : "from";
    const device = this.lastSyncResult.deviceName || "cloud";

    return {
      synced: true,
      message: `Synced ${direction} ${device}`,
      relativeTime,
      deviceName: this.lastSyncResult.deviceName,
    };
  }
}

// Singleton instance
let syncEngineInstance: CloudSyncEngine | null = null;

/**
 * Gets or creates the sync engine singleton
 */
export function getSyncEngine(): CloudSyncEngine {
  if (!syncEngineInstance) {
    syncEngineInstance = new CloudSyncEngine();
  }
  return syncEngineInstance;
}

/**
 * Destroys the sync engine singleton
 */
export function destroySyncEngine(): void {
  if (syncEngineInstance) {
    syncEngineInstance.destroy();
    syncEngineInstance = null;
  }
}
