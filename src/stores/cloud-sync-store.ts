/**
 * Cloud Sync Store
 *
 * Zustand store for managing cloud sync state and operations.
 */

import { create } from "zustand";
import { db, type CloudSyncConfig } from "@/lib/db/schema";
// Import only SSR-safe modules at top level
import {
  setSessionPassword,
  getSessionPassword,
  clearSessionPassword,
} from "@/lib/cloud-sync/encryption";
import {
  getOrCreateDeviceId,
  getOrCreateDeviceName,
} from "@/lib/cloud-sync/manifest";
import type { SyncResult, SyncProgress } from "@/lib/cloud-sync/sync-engine";
import { encryptApiKey, decryptApiKey, isEncryptedKey } from "@/lib/crypto/api-key-crypto";
import { toast } from "sonner";

// Dynamically import S3 client functions to avoid SSR issues
async function getS3Client() {
  const { createS3Client, testConnection, configureCors } = await import("@/lib/cloud-sync/s3-client");
  return { createS3Client, testConnection, configureCors };
}

async function getSyncEngineModule() {
  const { getSyncEngine } = await import("@/lib/cloud-sync/sync-engine");
  return { getSyncEngine };
}

export interface S3ClientOptions {
  provider: "s3" | "r2";
  bucket: string;
  region?: string;
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export type CloudSyncStatus = "disconnected" | "connecting" | "connected" | "syncing" | "error";

interface CloudSyncState {
  // Configuration
  config: CloudSyncConfig | null;
  isConfigured: boolean;
  isLoading: boolean;

  // Connection status
  status: CloudSyncStatus;
  error: string | null;

  // Sync state
  isSyncing: boolean;
  lastSyncResult: SyncResult | null;
  syncProgress: SyncProgress | null;

  // Actions
  loadConfig: () => Promise<void>;
  saveConfig: (config: Partial<Omit<CloudSyncConfig, "id" | "createdAt" | "updatedAt">>) => Promise<void>;
  deleteConfig: () => Promise<void>;
  testConnection: () => Promise<{ success: boolean; error?: string }>;
  configureCors: () => Promise<{ success: boolean; error?: string }>;
  setEnabled: (enabled: boolean) => Promise<void>;
  setAutoSync: (enabled: boolean) => Promise<void>;

  // Sync actions
  syncNow: () => Promise<SyncResult>;
  forceUpload: () => Promise<SyncResult>;
  forceDownload: () => Promise<SyncResult>;

  // Password management (for encrypted sync)
  setPassword: (password: string) => void;
  hasPassword: () => boolean;
  clearPassword: () => void;

  // Internal
  _initializeSyncEngine: () => Promise<void>;
}

export const useCloudSyncStore = create<CloudSyncState>((set, get) => ({
  config: null,
  isConfigured: false,
  isLoading: false,
  status: "disconnected",
  error: null,
  isSyncing: false,
  lastSyncResult: null,
  syncProgress: null,

  loadConfig: async () => {
    set({ isLoading: true });

    try {
      const config = await db.cloudSyncConfig.get("default");

      if (!config) {
        set({
          config: null,
          isConfigured: false,
          status: "disconnected",
          isLoading: false,
        });
        return;
      }

      // Decrypt credentials
      let accessKeyId = config.accessKeyId;
      let secretAccessKey = config.secretAccessKey;

      try {
        if (isEncryptedKey(accessKeyId)) {
          accessKeyId = await decryptApiKey(accessKeyId);
        }
        if (isEncryptedKey(secretAccessKey)) {
          secretAccessKey = await decryptApiKey(secretAccessKey);
        }
      } catch (error) {
        console.error("[CloudSync] Failed to decrypt credentials:", error);
        set({
          config: null,
          isConfigured: false,
          status: "error",
          error: "Failed to decrypt credentials. Please reconfigure.",
          isLoading: false,
        });
        return;
      }

      const decryptedConfig: CloudSyncConfig = {
        ...config,
        accessKeyId,
        secretAccessKey,
      };

      set({
        config: decryptedConfig,
        isConfigured: true,
        status: config.enabled ? "connected" : "disconnected",
        isLoading: false,
      });

      // Initialize sync engine if enabled
      if (config.enabled) {
        await get()._initializeSyncEngine();
      }
    } catch (error) {
      console.error("[CloudSync] Failed to load config:", error);
      set({
        config: null,
        isConfigured: false,
        status: "error",
        error: "Failed to load sync configuration",
        isLoading: false,
      });
    }
  },

  saveConfig: async (updates) => {
    const current = get().config;
    const now = Date.now();

    // Encrypt credentials if provided
    let accessKeyId = updates.accessKeyId;
    let secretAccessKey = updates.secretAccessKey;

    if (accessKeyId && !isEncryptedKey(accessKeyId)) {
      accessKeyId = await encryptApiKey(accessKeyId);
    }
    if (secretAccessKey && !isEncryptedKey(secretAccessKey)) {
      secretAccessKey = await encryptApiKey(secretAccessKey);
    }

    const configToSave: CloudSyncConfig = {
      id: "default",
      provider: updates.provider || current?.provider || "r2",
      bucket: updates.bucket || current?.bucket || "",
      region: updates.region ?? current?.region,
      endpoint: updates.endpoint ?? current?.endpoint,
      accessKeyId: accessKeyId || current?.accessKeyId || "",
      secretAccessKey: secretAccessKey || current?.secretAccessKey || "",
      enabled: updates.enabled ?? current?.enabled ?? false,
      autoSyncEnabled: updates.autoSyncEnabled ?? current?.autoSyncEnabled ?? true,
      syncIntervalSeconds: updates.syncIntervalSeconds ?? current?.syncIntervalSeconds ?? 30,
      encryptionEnabled: updates.encryptionEnabled ?? current?.encryptionEnabled ?? false,
      deviceId: current?.deviceId || getOrCreateDeviceId(),
      deviceName: updates.deviceName ?? current?.deviceName ?? getOrCreateDeviceName(),
      lastSyncAt: current?.lastSyncAt,
      lastSyncStatus: current?.lastSyncStatus,
      lastSyncError: current?.lastSyncError,
      lastSyncDeviceId: current?.lastSyncDeviceId,
      lastSyncDeviceName: current?.lastSyncDeviceName,
      createdAt: current?.createdAt || now,
      updatedAt: now,
    };

    await db.cloudSyncConfig.put(configToSave);

    // Reload config (to get decrypted version in state)
    await get().loadConfig();
  },

  deleteConfig: async () => {
    const { getSyncEngine } = await getSyncEngineModule();
    const engine = getSyncEngine();
    engine.destroy();

    await db.cloudSyncConfig.delete("default");
    clearSessionPassword();

    set({
      config: null,
      isConfigured: false,
      status: "disconnected",
      error: null,
      lastSyncResult: null,
      syncProgress: null,
    });

    toast.success("Cloud sync configuration deleted");
  },

  testConnection: async () => {
    const config = get().config;

    if (!config) {
      return { success: false, error: "Not configured" };
    }

    set({ status: "connecting" });

    try {
      const { createS3Client, testConnection } = await getS3Client();
      const clientOptions: S3ClientOptions = {
        provider: config.provider,
        bucket: config.bucket,
        region: config.region,
        endpoint: config.endpoint,
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      };

      const client = createS3Client(clientOptions);
      const result = await testConnection(client, config.bucket);

      if (result.success) {
        set({ status: "connected", error: null });
        return { success: true };
      } else {
        set({ status: "error", error: result.error });
        return { success: false, error: result.error };
      }
    } catch (error) {
      const err = error as Error;
      set({ status: "error", error: err.message });
      return { success: false, error: err.message };
    }
  },

  configureCors: async () => {
    const config = get().config;

    if (!config) {
      return { success: false, error: "Not configured" };
    }

    try {
      const { createS3Client, configureCors } = await getS3Client();
      const clientOptions: S3ClientOptions = {
        provider: config.provider,
        bucket: config.bucket,
        region: config.region,
        endpoint: config.endpoint,
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      };

      const client = createS3Client(clientOptions);
      const result = await configureCors(client, config.bucket);

      if (result.success) {
        toast.success("CORS configured successfully");
        return { success: true };
      } else {
        toast.error("Failed to configure CORS", { description: result.error });
        return { success: false, error: result.error };
      }
    } catch (error) {
      const err = error as Error;
      toast.error("Failed to configure CORS", { description: err.message });
      return { success: false, error: err.message };
    }
  },

  setEnabled: async (enabled) => {
    await get().saveConfig({ enabled });

    if (enabled) {
      await get()._initializeSyncEngine();
      toast.success("Cloud sync enabled");
    } else {
      const { getSyncEngine } = await getSyncEngineModule();
      const engine = getSyncEngine();
      engine.stopAutoSync();
      set({ status: "disconnected" });
      toast.success("Cloud sync disabled");
    }
  },

  setAutoSync: async (enabled) => {
    await get().saveConfig({ autoSyncEnabled: enabled });

    const { getSyncEngine } = await getSyncEngineModule();
    const engine = getSyncEngine();
    if (enabled && get().config?.enabled) {
      engine.startAutoSync();
      toast.success("Auto-sync enabled");
    } else {
      engine.stopAutoSync();
      toast.success("Auto-sync disabled");
    }
  },

  syncNow: async () => {
    const config = get().config;

    if (!config?.enabled) {
      return {
        status: "error" as const,
        direction: "none" as const,
        message: "Sync not enabled",
        timestamp: Date.now(),
      };
    }

    set({ isSyncing: true, syncProgress: null });

    const { getSyncEngine } = await getSyncEngineModule();
    const engine = getSyncEngine();

    engine.setProgressCallback((progress) => {
      set({ syncProgress: progress });
    });

    const result = await engine.sync();

    set({
      isSyncing: false,
      lastSyncResult: result,
      syncProgress: null,
      status: result.status === "error" ? "error" : "connected",
      error: result.error || null,
    });

    // Update config with last sync info
    if (result.status === "success" && result.direction !== "none") {
      await db.cloudSyncConfig.update("default", {
        lastSyncAt: result.timestamp,
        lastSyncStatus: "success",
        lastSyncDeviceName: result.deviceName,
        updatedAt: Date.now(),
      });
    } else if (result.status === "error") {
      await db.cloudSyncConfig.update("default", {
        lastSyncStatus: "error",
        lastSyncError: result.error,
        updatedAt: Date.now(),
      });
    }

    return result;
  },

  forceUpload: async () => {
    set({ isSyncing: true, syncProgress: null });

    const { getSyncEngine } = await getSyncEngineModule();
    const engine = getSyncEngine();

    engine.setProgressCallback((progress) => {
      set({ syncProgress: progress });
    });

    const result = await engine.sync({ force: true, direction: "upload" });

    set({
      isSyncing: false,
      lastSyncResult: result,
      syncProgress: null,
      status: result.status === "error" ? "error" : "connected",
      error: result.error || null,
    });

    if (result.status === "success") {
      toast.success("Data uploaded to cloud");
    } else {
      toast.error("Upload failed", { description: result.error });
    }

    return result;
  },

  forceDownload: async () => {
    set({ isSyncing: true, syncProgress: null });

    const { getSyncEngine } = await getSyncEngineModule();
    const engine = getSyncEngine();

    engine.setProgressCallback((progress) => {
      set({ syncProgress: progress });
    });

    const result = await engine.sync({ force: true, direction: "download" });

    set({
      isSyncing: false,
      lastSyncResult: result,
      syncProgress: null,
      status: result.status === "error" ? "error" : "connected",
      error: result.error || null,
    });

    if (result.status === "success") {
      toast.success("Data downloaded from cloud");
      // Reload page to reflect imported data
      if (result.direction === "download") {
        window.location.reload();
      }
    } else {
      toast.error("Download failed", { description: result.error });
    }

    return result;
  },

  setPassword: (password) => {
    setSessionPassword(password);
  },

  hasPassword: () => {
    return getSessionPassword() !== null;
  },

  clearPassword: () => {
    clearSessionPassword();
  },

  _initializeSyncEngine: async () => {
    const config = get().config;

    if (!config) {
      console.warn("[CloudSync] Cannot initialize: no config");
      return;
    }

    const { getSyncEngine } = await getSyncEngineModule();
    const engine = getSyncEngine();

    const result = await engine.initialize(config);

    if (!result.success) {
      console.error("[CloudSync] Failed to initialize engine:", result.error);
      set({ status: "error", error: result.error });
      return;
    }

    set({ status: "connected" });

    // Start auto-sync if enabled
    if (config.autoSyncEnabled) {
      engine.startAutoSync();
    }

    // Set up visibility change handler
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => {
        engine.handleVisibilityChange();
      });
    }
  },
}));
