/**
 * S3 storage adapter for encrypted API keys
 * Each device uploads its own encrypted key bundle
 */

import { S3Adapter } from "./s3-adapter";

export interface EncryptedKeyBundle {
  version: 1;
  deviceId: string;
  timestamp: number;
  keys: Array<{
    id: string;
    provider: string;
    encryptedKey: string;
    label?: string;
    baseUrl?: string;
    version: number;
    deviceId: string;
    createdAt: number;
    updatedAt: number;
  }>;
}

/**
 * Upload encrypted keys for this device
 * @param deviceId - The device ID
 * @param bundle - The encrypted key bundle
 */
export async function uploadKeysToS3(
  deviceId: string,
  bundle: EncryptedKeyBundle
): Promise<void> {
  const adapter = await S3Adapter.fromConfig();
  if (!adapter) {
    throw new Error("S3 not configured. Please configure S3 sync first.");
  }

  const key = `api-keys/${deviceId}.json`;
  const body = JSON.stringify(bundle, null, 2);

  // Use the adapter's putObject method
  await (adapter as any).putObject(key, body);
}

/**
 * Download all encrypted key bundles from S3
 * @returns Array of encrypted key bundles from all devices
 */
export async function downloadKeysFromS3(): Promise<EncryptedKeyBundle[]> {
  const adapter = await S3Adapter.fromConfig();
  if (!adapter) {
    throw new Error("S3 not configured. Please configure S3 sync first.");
  }

  const prefix = "api-keys/";
  const files = await (adapter as any).listObjects(prefix);

  const bundles: EncryptedKeyBundle[] = [];

  for (const file of files) {
    try {
      const content = await (adapter as any).getObject(file.key);
      const bundle = JSON.parse(content) as EncryptedKeyBundle;
      bundles.push(bundle);
    } catch (error) {
      console.error(`[ApiKeyS3] Failed to download ${file.key}:`, error);
      // Continue with other files
    }
  }

  return bundles;
}

/**
 * Delete this device's keys from S3
 * @param deviceId - The device ID to delete keys for
 */
export async function deleteKeysFromS3(deviceId: string): Promise<void> {
  const adapter = await S3Adapter.fromConfig();
  if (!adapter) {
    throw new Error("S3 not configured. Please configure S3 sync first.");
  }

  const key = `api-keys/${deviceId}.json`;

  // Implement DELETE using the same pattern as PUT/GET
  await deleteObject(adapter, key);
}

/**
 * DELETE an object from S3
 * Helper function since S3Adapter doesn't expose deleteObject
 */
async function deleteObject(adapter: S3Adapter, key: string): Promise<void> {
  const adapterAny = adapter as any;
  const endpoint = adapterAny.endpoint;
  const bucket = adapterAny.bucket;

  // Check if endpoint already includes bucket (for path-style URLs)
  const url = endpoint.includes(bucket)
    ? `${endpoint}/${key}`
    : `${endpoint}/${bucket}/${key}`;

  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const date = new Date().toUTCString();

  const response = await fetch(url, {
    method: "DELETE",
    headers: {
      "x-amz-date": amzDate,
      "x-amz-content-sha256": "UNSIGNED-PAYLOAD",
      Authorization: await adapterAny.getAuthHeader("DELETE", key, date),
    },
  });

  if (!response.ok && response.status !== 404) {
    const errorText = await response.text();
    console.error(`[S3] DELETE failed:`, {
      status: response.status,
      statusText: response.statusText,
      url,
      error: errorText,
    });
    throw new Error(
      `Failed to delete from S3 (${response.status}): ${errorText || response.statusText}`
    );
  }
}
