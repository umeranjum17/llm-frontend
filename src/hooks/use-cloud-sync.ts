/**
 * Cloud Sync Hook
 *
 * React hook for managing cloud sync lifecycle and status.
 * Handles initialization, auto-sync, and visibility changes.
 */

import { useEffect, useCallback } from "react";
import { useCloudSyncStore } from "@/stores/cloud-sync-store";
import { getSyncEngine, destroySyncEngine } from "@/lib/cloud-sync";

interface UseCloudSyncOptions {
  autoInitialize?: boolean;
}

export function useCloudSync(options: UseCloudSyncOptions = {}) {
  const { autoInitialize = true } = options;

  const {
    config,
    isConfigured,
    isLoading,
    status,
    error,
    isSyncing,
    lastSyncResult,
    syncProgress,
    loadConfig,
    saveConfig,
    deleteConfig,
    testConnection,
    configureCors,
    setEnabled,
    setAutoSync,
    syncNow,
    forceUpload,
    forceDownload,
    setPassword,
    hasPassword,
    clearPassword,
  } = useCloudSyncStore();

  // Initialize on mount
  useEffect(() => {
    if (autoInitialize) {
      loadConfig();
    }

    // Cleanup on unmount
    return () => {
      // Don't destroy the engine on unmount - it should persist
      // destroySyncEngine();
    };
  }, [autoInitialize, loadConfig]);

  // Trigger sync on visibility change (when user returns to tab)
  useEffect(() => {
    if (!isConfigured || !config?.enabled) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        // Small delay to let any pending operations settle
        setTimeout(() => {
          syncNow();
        }, 500);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isConfigured, config?.enabled, syncNow]);

  // Computed status for UI
  const isConnected = status === "connected";
  const isError = status === "error";
  const needsPassword = config?.encryptionEnabled && !hasPassword();

  // Formatted last sync info
  const lastSyncInfo = useCallback(() => {
    if (!lastSyncResult) {
      return {
        synced: false,
        message: "Never synced",
      };
    }

    if (lastSyncResult.status === "error") {
      return {
        synced: false,
        message: lastSyncResult.error || "Sync failed",
      };
    }

    // Format relative time
    const diff = Date.now() - lastSyncResult.timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);

    let relativeTime: string;
    if (minutes < 1) {
      relativeTime = "just now";
    } else if (minutes < 60) {
      relativeTime = `${minutes}m ago`;
    } else if (hours < 24) {
      relativeTime = `${hours}h ago`;
    } else {
      relativeTime = new Date(lastSyncResult.timestamp).toLocaleDateString();
    }

    if (lastSyncResult.direction === "none") {
      return {
        synced: true,
        message: "Up to date",
        relativeTime,
      };
    }

    const direction = lastSyncResult.direction === "upload" ? "to" : "from";
    const device = lastSyncResult.deviceName || "cloud";

    return {
      synced: true,
      message: `Synced ${direction} ${device}`,
      relativeTime,
      deviceName: lastSyncResult.deviceName,
    };
  }, [lastSyncResult]);

  return {
    // State
    config,
    isConfigured,
    isLoading,
    status,
    error,
    isSyncing,
    lastSyncResult,
    syncProgress,

    // Computed
    isConnected,
    isError,
    needsPassword,
    lastSyncInfo,

    // Actions
    loadConfig,
    saveConfig,
    deleteConfig,
    testConnection,
    configureCors,
    setEnabled,
    setAutoSync,
    syncNow,
    forceUpload,
    forceDownload,
    setPassword,
    hasPassword,
    clearPassword,
  };
}

/**
 * Hook for sync status indicator (minimal state for header)
 */
export function useCloudSyncStatus() {
  const {
    config,
    isConfigured,
    status,
    isSyncing,
    lastSyncResult,
    error,
    syncNow,
  } = useCloudSyncStore();

  // Format last sync for tooltip
  const tooltipText = useCallback(() => {
    if (!isConfigured) {
      return "Cloud sync not configured";
    }

    if (!config?.enabled) {
      return "Cloud sync disabled";
    }

    if (isSyncing) {
      return "Syncing...";
    }

    if (error) {
      return `Sync error: ${error}`;
    }

    if (!lastSyncResult) {
      return "Never synced";
    }

    if (lastSyncResult.status === "error") {
      return `Last sync failed: ${lastSyncResult.error}`;
    }

    // Format relative time
    const diff = Date.now() - lastSyncResult.timestamp;
    const minutes = Math.floor(diff / 60000);

    if (minutes < 1) {
      return lastSyncResult.deviceName
        ? `Synced just now (${lastSyncResult.deviceName})`
        : "Synced just now";
    }

    if (minutes < 60) {
      return lastSyncResult.deviceName
        ? `Last synced ${minutes}m ago from ${lastSyncResult.deviceName}`
        : `Last synced ${minutes}m ago`;
    }

    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
      return lastSyncResult.deviceName
        ? `Last synced ${hours}h ago from ${lastSyncResult.deviceName}`
        : `Last synced ${hours}h ago`;
    }

    return lastSyncResult.deviceName
      ? `Last synced ${new Date(lastSyncResult.timestamp).toLocaleDateString()} from ${lastSyncResult.deviceName}`
      : `Last synced ${new Date(lastSyncResult.timestamp).toLocaleDateString()}`;
  }, [isConfigured, config?.enabled, isSyncing, error, lastSyncResult]);

  return {
    isConfigured,
    isEnabled: config?.enabled ?? false,
    status,
    isSyncing,
    hasError: status === "error",
    tooltipText,
    syncNow,
  };
}
