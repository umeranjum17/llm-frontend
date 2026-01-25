import { db } from "@/lib/db/schema";

/**
 * Generate or retrieve a persistent device ID for this browser/device.
 * Stored in the _syncMeta table to persist across sessions.
 */
export async function getDeviceId(): Promise<string> {
  try {
    // Check if table exists (db might not be migrated yet)
    if (!db._syncMeta) {
      console.warn("[DeviceID] _syncMeta table doesn't exist yet - database needs migration");
      // Return a temporary device ID until migration completes
      return `temp-device-${Date.now()}`;
    }

    const meta = await db._syncMeta.get("default");

    if (meta?.deviceId) {
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

    return deviceId;
  } catch (error) {
    if (error instanceof Error && error.name === "NotFoundError") {
      console.warn("[DeviceID] _syncMeta table not found - database needs migration to v20");
      return `temp-device-${Date.now()}`;
    }
    console.error("Error getting device ID:", error);
    throw error;
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
 * Get the last sync timestamp for this device
 */
export async function getLastSyncTime(): Promise<number> {
  try {
    if (!db._syncMeta) return 0;
    const meta = await db._syncMeta.get("default");
    return meta?.lastSyncAt || 0;
  } catch (error) {
    if (error instanceof Error && error.name === "NotFoundError") return 0;
    console.error("[DeviceID] Error getting last sync time:", error);
    return 0;
  }
}

/**
 * Update the last sync timestamp
 */
export async function setLastSyncTime(timestamp: number): Promise<void> {
  try {
    if (!db._syncMeta) {
      console.warn("[DeviceID] Cannot set sync time - table doesn't exist");
      return;
    }

    const deviceId = await getDeviceId();
    const meta = await db._syncMeta.get("default");

    // IMPORTANT: Must preserve s3Config when updating timestamp
    await db._syncMeta.put({
      id: "default",
      deviceId,
      lastSyncAt: timestamp,
      s3Config: meta?.s3Config, // Preserve existing config
    });

    console.log("[DeviceID] Updated lastSyncAt, s3Config preserved:", !!meta?.s3Config);
  } catch (error) {
    if (error instanceof Error && error.name === "NotFoundError") {
      console.warn("[DeviceID] Cannot set sync time - table not found");
      return;
    }
    console.error("[DeviceID] Error setting sync time:", error);
  }
}

/**
 * Get S3 configuration for sync
 */
export async function getS3Config() {
  try {
    if (!db._syncMeta) {
      console.warn("[DeviceID] _syncMeta table doesn't exist - database needs migration to v20");
      return undefined;
    }

    const meta = await db._syncMeta.get("default");
    console.log("[DeviceID] Getting S3 config - meta exists:", !!meta, "config exists:", !!meta?.s3Config);
    if (meta?.s3Config) {
      console.log("[DeviceID] Config details:", {
        endpoint: meta.s3Config.endpoint?.substring(0, 30) + "...",
        bucket: meta.s3Config.bucket,
        region: meta.s3Config.region,
        hasAccessKey: !!meta.s3Config.accessKeyId,
        hasSecretKey: !!meta.s3Config.secretAccessKey,
      });
    }
    return meta?.s3Config;
  } catch (error) {
    if (error instanceof Error && error.name === "NotFoundError") {
      console.warn("[DeviceID] _syncMeta table not found - database needs migration to v20");
      return undefined;
    }
    console.error("[DeviceID] Error getting S3 config:", error);
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
  try {
    if (!db._syncMeta) {
      const error = new Error("Database migration required: _syncMeta table doesn't exist. Please refresh the page to complete migration to v20.");
      console.error("[DeviceID]", error.message);
      throw error;
    }

    const deviceId = await getDeviceId();
    const meta = await db._syncMeta.get("default");

    console.log("[DeviceID] Saving S3 config:", {
      endpoint: config.endpoint?.substring(0, 30) + "...",
      bucket: config.bucket,
      region: config.region,
      hasAccessKey: !!config.accessKeyId,
      hasSecretKey: !!config.secretAccessKey,
    });

    await db._syncMeta.put({
      id: "default",
      deviceId,
      lastSyncAt: meta?.lastSyncAt || 0,
      s3Config: config,
    });

    console.log("[DeviceID] S3 config saved successfully");

    // Verify it was saved
    const saved = await db._syncMeta.get("default");
    console.log("[DeviceID] Verification - config exists after save:", !!saved?.s3Config);
  } catch (error) {
    if (error instanceof Error && error.name === "NotFoundError") {
      const migrationError = new Error("Database migration required: _syncMeta table not found. Please refresh the page to complete migration to v20.");
      console.error("[DeviceID]", migrationError.message);
      throw migrationError;
    }
    console.error("[DeviceID] Error saving S3 config:", error);
    throw error;
  }
}
