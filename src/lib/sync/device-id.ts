import { db } from "@/lib/db/schema";

/**
 * Generate or retrieve a persistent device ID for this browser/device.
 * Stored in the _syncMeta table to persist across sessions.
 */
export async function getDeviceId(): Promise<string> {
  try {
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
  const meta = await db._syncMeta.get("default");
  return meta?.lastSyncAt || 0;
}

/**
 * Update the last sync timestamp
 */
export async function setLastSyncTime(timestamp: number): Promise<void> {
  const deviceId = await getDeviceId();

  await db._syncMeta.put({
    id: "default",
    deviceId,
    lastSyncAt: timestamp,
  });
}

/**
 * Get S3 configuration for sync
 */
export async function getS3Config() {
  const meta = await db._syncMeta.get("default");
  return meta?.s3Config;
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
  const deviceId = await getDeviceId();
  const meta = await db._syncMeta.get("default");

  await db._syncMeta.put({
    id: "default",
    deviceId,
    lastSyncAt: meta?.lastSyncAt || 0,
    s3Config: config,
  });
}
