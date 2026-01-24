/**
 * Manifest Manager
 *
 * Manages the sync manifest file that coordinates Last-Write-Wins sync
 * between devices. The manifest contains timestamps and device info.
 */

import type { S3Client } from "@aws-sdk/client-s3";
import { uploadJSON, downloadJSON } from "./s3-client";

// Manifest file key in the bucket
export const MANIFEST_KEY = "lumina-sync/manifest.json";

// Data file key in the bucket
export const DATA_KEY = "lumina-sync/data.json";

/**
 * Sync manifest structure stored in cloud
 */
export interface SyncManifest {
  version: number; // Manifest format version
  deviceId: string; // Unique ID of device that uploaded
  deviceName?: string; // Human-readable device name (e.g., "MacBook", "iPhone")
  lastUpdated: number; // Unix timestamp of last sync
  dataChecksum?: string; // MD5/SHA256 hash of data.json for integrity
  appVersion?: string; // App version that created this
  encryptionEnabled?: boolean; // Whether data.json is encrypted
}

// Current manifest format version
export const MANIFEST_VERSION = 1;

/**
 * Generates a unique device ID
 * Persisted in localStorage to identify this device across sessions
 */
export function generateDeviceId(): string {
  // Use crypto API for random ID generation
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  // Fallback for older browsers
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Detects the device name based on user agent
 */
export function detectDeviceName(): string {
  if (typeof navigator === "undefined") {
    return "Unknown Device";
  }

  const ua = navigator.userAgent;

  // iOS devices
  if (/iPad/.test(ua)) return "iPad";
  if (/iPhone/.test(ua)) return "iPhone";

  // Android devices
  if (/Android/.test(ua)) {
    if (/Mobile/.test(ua)) return "Android Phone";
    return "Android Tablet";
  }

  // Desktop browsers
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows PC";
  if (/Linux/.test(ua)) return "Linux PC";
  if (/CrOS/.test(ua)) return "Chromebook";

  return "Unknown Device";
}

/**
 * Gets or creates a persistent device ID from localStorage
 */
export function getOrCreateDeviceId(): string {
  const STORAGE_KEY = "lumina_device_id";

  if (typeof localStorage === "undefined") {
    return generateDeviceId();
  }

  let deviceId = localStorage.getItem(STORAGE_KEY);

  if (!deviceId) {
    deviceId = generateDeviceId();
    localStorage.setItem(STORAGE_KEY, deviceId);
  }

  return deviceId;
}

/**
 * Gets or creates a persistent device name from localStorage
 */
export function getOrCreateDeviceName(): string {
  const STORAGE_KEY = "lumina_device_name";

  if (typeof localStorage === "undefined") {
    return detectDeviceName();
  }

  let deviceName = localStorage.getItem(STORAGE_KEY);

  if (!deviceName) {
    deviceName = detectDeviceName();
    localStorage.setItem(STORAGE_KEY, deviceName);
  }

  return deviceName;
}

/**
 * Updates the stored device name
 */
export function setDeviceName(name: string): void {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem("lumina_device_name", name);
  }
}

/**
 * Creates a new manifest
 */
export function createManifest(
  deviceId: string,
  deviceName?: string,
  dataChecksum?: string,
  encryptionEnabled?: boolean
): SyncManifest {
  return {
    version: MANIFEST_VERSION,
    deviceId,
    deviceName: deviceName || detectDeviceName(),
    lastUpdated: Date.now(),
    dataChecksum,
    appVersion: typeof process !== "undefined" ? process.env.NEXT_PUBLIC_APP_VERSION : undefined,
    encryptionEnabled,
  };
}

/**
 * Reads the manifest from cloud storage
 */
export async function readManifest(
  client: S3Client,
  bucket: string
): Promise<{ success: boolean; manifest?: SyncManifest; notFound?: boolean; error?: string }> {
  const result = await downloadJSON<SyncManifest>(client, bucket, MANIFEST_KEY);

  if (!result.success) {
    return {
      success: false,
      notFound: result.notFound,
      error: result.error,
    };
  }

  // Validate manifest structure
  if (!result.data || typeof result.data.deviceId !== "string" || typeof result.data.lastUpdated !== "number") {
    return {
      success: false,
      error: "Invalid manifest format",
    };
  }

  return {
    success: true,
    manifest: result.data,
  };
}

/**
 * Writes the manifest to cloud storage
 */
export async function writeManifest(
  client: S3Client,
  bucket: string,
  manifest: SyncManifest
): Promise<{ success: boolean; error?: string }> {
  const result = await uploadJSON(client, bucket, MANIFEST_KEY, manifest);

  if (!result.success) {
    return {
      success: false,
      error: result.error,
    };
  }

  return { success: true };
}

/**
 * Comparison result for sync decision
 */
export type SyncDirection = "upload" | "download" | "none" | "conflict";

export interface SyncDecision {
  direction: SyncDirection;
  reason: string;
  remoteManifest?: SyncManifest;
}

/**
 * Compares local and remote state to decide sync direction
 *
 * @param localLastSyncAt - Local timestamp of last successful sync (0 if never synced)
 * @param localDeviceId - This device's unique ID
 * @param remoteManifest - Remote manifest (null if doesn't exist)
 * @param hasLocalChanges - Whether local DB has changes since last sync
 */
export function decideSyncDirection(
  localLastSyncAt: number,
  localDeviceId: string,
  remoteManifest: SyncManifest | null,
  hasLocalChanges: boolean
): SyncDecision {
  // Case 1: No remote manifest exists - this is the first sync
  if (!remoteManifest) {
    if (hasLocalChanges) {
      return {
        direction: "upload",
        reason: "First sync - uploading local data",
      };
    }
    return {
      direction: "none",
      reason: "No remote data and no local changes",
    };
  }

  // Case 2: Same device uploaded - skip download to prevent sync loops
  if (remoteManifest.deviceId === localDeviceId) {
    if (hasLocalChanges) {
      return {
        direction: "upload",
        reason: "Local changes since last sync",
        remoteManifest,
      };
    }
    return {
      direction: "none",
      reason: "This device uploaded the latest version",
      remoteManifest,
    };
  }

  // Case 3: Different device uploaded - compare timestamps
  const remoteIsNewer = remoteManifest.lastUpdated > localLastSyncAt;
  const localIsNewer = hasLocalChanges;

  if (remoteIsNewer && !localIsNewer) {
    // Remote has newer data and no local changes - download
    return {
      direction: "download",
      reason: `Newer data from ${remoteManifest.deviceName || "another device"}`,
      remoteManifest,
    };
  }

  if (!remoteIsNewer && localIsNewer) {
    // Local has changes and remote is stale - upload
    return {
      direction: "upload",
      reason: "Local changes are newer",
      remoteManifest,
    };
  }

  if (remoteIsNewer && localIsNewer) {
    // Both have changes - conflict (Last-Write-Wins: upload wins)
    // This is where we could show a conflict UI, but for simplicity we upload
    return {
      direction: "conflict",
      reason: `Conflict: local changes and newer remote from ${remoteManifest.deviceName || "another device"}`,
      remoteManifest,
    };
  }

  // Neither has changes
  return {
    direction: "none",
    reason: "Already in sync",
    remoteManifest,
  };
}

/**
 * Calculates a simple checksum for data integrity verification
 */
export async function calculateChecksum(data: string | Blob): Promise<string> {
  let arrayBuffer: ArrayBuffer;

  if (data instanceof Blob) {
    arrayBuffer = await data.arrayBuffer();
  } else {
    const encoder = new TextEncoder();
    arrayBuffer = encoder.encode(data).buffer;
  }

  // Use SubtleCrypto for SHA-256 if available
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  // Fallback: simple hash for older environments
  const bytes = new Uint8Array(arrayBuffer);
  let hash = 0;
  for (let i = 0; i < bytes.length; i++) {
    hash = (hash << 5) - hash + bytes[i];
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16);
}

/**
 * Formats a relative time string for UI display
 * e.g., "2m ago", "1h ago", "Yesterday"
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;

  // Format as date for older entries
  return new Date(timestamp).toLocaleDateString();
}
