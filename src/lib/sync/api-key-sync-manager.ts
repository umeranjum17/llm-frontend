/**
 * API Key Sync Manager
 * Handles encryption and syncing of API keys across devices
 */

import { getAllApiKeys, addApiKey, updateApiKey, clearSyncedApiKeys } from "@/lib/db/queries";
import { getSettings, updateSettings } from "@/lib/db/queries";
import { decryptApiKey, encryptApiKey } from "@/lib/crypto/api-key-crypto";
import {
  encryptApiKeyForSync,
  decryptApiKeyFromSync,
  validateSyncPassword,
} from "@/lib/crypto/api-key-sync-crypto";
import {
  uploadKeysToS3,
  downloadKeysFromS3,
  deleteKeysFromS3,
  type EncryptedKeyBundle,
} from "./api-key-s3-storage";
import { getDeviceId } from "./device-id";
import type { ApiKey } from "@/lib/db/schema";

export interface SyncResult {
  success: boolean;
  uploaded: number;
  downloaded: number;
  conflicts: number;
  error?: string;
}

/**
 * Enable API key sync
 * Encrypts all local API keys with the sync password and uploads to S3
 */
export async function enableApiKeySync(
  password: string,
  hint?: string
): Promise<SyncResult> {
  try {
    // 1. Validate password strength
    const validation = validateSyncPassword(password);
    if (!validation.valid) {
      return {
        success: false,
        uploaded: 0,
        downloaded: 0,
        conflicts: 0,
        error: validation.errors.join(", "),
      };
    }

    // 2. Get device ID
    const deviceId = await getDeviceId();

    // 3. Get all local API keys
    const localKeys = await getAllApiKeys();

    // 4. Decrypt keys with device key, then re-encrypt with sync password
    const encryptedKeys = [];
    for (const key of localKeys) {
      try {
        // Decrypt with device-local key
        const plainKey = await decryptApiKey(key.key);

        // Re-encrypt with sync password
        const encryptedKey = await encryptApiKeyForSync(plainKey, password);

        encryptedKeys.push({
          id: key.id,
          provider: key.provider,
          encryptedKey,
          label: key.label,
          baseUrl: key.baseUrl,
          version: Date.now(),
          deviceId,
          createdAt: key.createdAt,
          updatedAt: Date.now(),
        });
      } catch (error) {
        console.error(`[ApiKeySync] Failed to encrypt key ${key.id}:`, error);
        // Continue with other keys
      }
    }

    // 5. Create bundle and upload to S3
    const bundle: EncryptedKeyBundle = {
      version: 1,
      deviceId,
      timestamp: Date.now(),
      keys: encryptedKeys,
    };

    await uploadKeysToS3(deviceId, bundle);

    // 6. Update settings
    await updateSettings({
      apiKeySyncEnabled: true,
      apiKeySyncHint: hint,
      lastApiKeySyncAt: Date.now(),
    });

    return {
      success: true,
      uploaded: encryptedKeys.length,
      downloaded: 0,
      conflicts: 0,
    };
  } catch (error) {
    console.error("[ApiKeySync] Enable sync failed:", error);
    return {
      success: false,
      uploaded: 0,
      downloaded: 0,
      conflicts: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Sync API keys
 * Uploads local keys and downloads/merges remote keys
 */
export async function syncApiKeys(password: string): Promise<SyncResult> {
  try {
    const deviceId = await getDeviceId();
    let uploaded = 0;
    let downloaded = 0;
    let conflicts = 0;

    // 1. Upload local keys
    const localKeys = await getAllApiKeys();
    const encryptedKeys = [];

    for (const key of localKeys) {
      try {
        const plainKey = await decryptApiKey(key.key);
        const encryptedKey = await encryptApiKeyForSync(plainKey, password);

        encryptedKeys.push({
          id: key.id,
          provider: key.provider,
          encryptedKey,
          label: key.label,
          baseUrl: key.baseUrl,
          version: Date.now(),
          deviceId,
          createdAt: key.createdAt,
          updatedAt: Date.now(),
        });
      } catch (error) {
        console.error(`[ApiKeySync] Failed to encrypt key ${key.id}:`, error);
      }
    }

    const bundle: EncryptedKeyBundle = {
      version: 1,
      deviceId,
      timestamp: Date.now(),
      keys: encryptedKeys,
    };

    await uploadKeysToS3(deviceId, bundle);
    uploaded = encryptedKeys.length;

    // 2. Download all remote bundles
    const remoteBundles = await downloadKeysFromS3();

    // 3. Merge remote keys with local keys
    const localKeysMap = new Map(localKeys.map((k) => [k.id, k]));

    for (const remoteBundle of remoteBundles) {
      // Skip our own bundle
      if (remoteBundle.deviceId === deviceId) continue;

      for (const remoteKey of remoteBundle.keys) {
        try {
          const localKey = localKeysMap.get(remoteKey.id);

          // If key doesn't exist locally, or remote is newer, download it
          if (!localKey || remoteKey.version > (localKey.createdAt || 0)) {
            // Decrypt with sync password
            const plainKey = await decryptApiKeyFromSync(
              remoteKey.encryptedKey,
              password
            );

            // Re-encrypt with device-local key
            const deviceEncryptedKey = await encryptApiKey(plainKey);

            const apiKey: ApiKey = {
              id: remoteKey.id,
              provider: remoteKey.provider,
              key: deviceEncryptedKey,
              label: remoteKey.label,
              baseUrl: remoteKey.baseUrl,
              createdAt: remoteKey.createdAt,
            };

            if (localKey) {
              // Update existing key
              await updateApiKey(remoteKey.id, apiKey);
              conflicts++;
            } else {
              // Add new key
              await addApiKey(apiKey);
              downloaded++;
            }
          }
        } catch (error) {
          console.error(`[ApiKeySync] Failed to process remote key:`, error);
        }
      }
    }

    // 4. Update last sync time
    await updateSettings({
      lastApiKeySyncAt: Date.now(),
    });

    return {
      success: true,
      uploaded,
      downloaded,
      conflicts,
    };
  } catch (error) {
    console.error("[ApiKeySync] Sync failed:", error);
    return {
      success: false,
      uploaded: 0,
      downloaded: 0,
      conflicts: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Download and setup keys on a new device
 */
export async function downloadAndSetupKeys(password: string): Promise<SyncResult> {
  try {
    const deviceId = await getDeviceId();
    let downloaded = 0;

    // 1. Download all remote bundles
    const remoteBundles = await downloadKeysFromS3();

    if (remoteBundles.length === 0) {
      return {
        success: false,
        uploaded: 0,
        downloaded: 0,
        conflicts: 0,
        error: "No encrypted keys found in cloud storage",
      };
    }

    // 2. Collect all unique keys from all devices (use newest version)
    const keysMap = new Map<
      string,
      {
        id: string;
        provider: string;
        encryptedKey: string;
        label?: string;
        baseUrl?: string;
        version: number;
        createdAt: number;
      }
    >();

    for (const bundle of remoteBundles) {
      for (const key of bundle.keys) {
        const existing = keysMap.get(key.id);
        if (!existing || key.version > existing.version) {
          keysMap.set(key.id, key);
        }
      }
    }

    // 3. Decrypt and re-encrypt with device-local key
    for (const [, remoteKey] of keysMap) {
      try {
        // Decrypt with sync password
        const plainKey = await decryptApiKeyFromSync(
          remoteKey.encryptedKey,
          password
        );

        // Re-encrypt with device-local key
        const deviceEncryptedKey = await encryptApiKey(plainKey);

        const apiKey: ApiKey = {
          id: remoteKey.id,
          provider: remoteKey.provider,
          key: deviceEncryptedKey,
          label: remoteKey.label,
          baseUrl: remoteKey.baseUrl,
          createdAt: remoteKey.createdAt,
        };

        await addApiKey(apiKey);
        downloaded++;
      } catch (error) {
        console.error(`[ApiKeySync] Failed to setup key:`, error);
      }
    }

    // 4. Enable sync and update settings
    await updateSettings({
      apiKeySyncEnabled: true,
      lastApiKeySyncAt: Date.now(),
    });

    return {
      success: true,
      uploaded: 0,
      downloaded,
      conflicts: 0,
    };
  } catch (error) {
    console.error("[ApiKeySync] Download and setup failed:", error);
    return {
      success: false,
      uploaded: 0,
      downloaded: 0,
      conflicts: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Disable API key sync
 * Clears synced keys table and deletes from S3
 */
export async function disableApiKeySync(): Promise<void> {
  try {
    const deviceId = await getDeviceId();

    // 1. Delete from S3
    try {
      await deleteKeysFromS3(deviceId);
    } catch (error) {
      console.error("[ApiKeySync] Failed to delete from S3:", error);
      // Continue anyway
    }

    // 2. Clear local synced keys table
    await clearSyncedApiKeys();

    // 3. Update settings
    await updateSettings({
      apiKeySyncEnabled: false,
      apiKeySyncHint: undefined,
      lastApiKeySyncAt: undefined,
    });
  } catch (error) {
    console.error("[ApiKeySync] Disable sync failed:", error);
    throw error;
  }
}

/**
 * Change sync password
 * Re-encrypts all keys with new password and uploads to S3
 */
export async function changeSyncPassword(
  oldPassword: string,
  newPassword: string,
  hint?: string
): Promise<SyncResult> {
  try {
    // 1. Validate new password
    const validation = validateSyncPassword(newPassword);
    if (!validation.valid) {
      return {
        success: false,
        uploaded: 0,
        downloaded: 0,
        conflicts: 0,
        error: validation.errors.join(", "),
      };
    }

    // 2. Verify old password by trying to decrypt one key
    const localKeys = await getAllApiKeys();
    if (localKeys.length > 0) {
      try {
        const plainKey = await decryptApiKey(localKeys[0].key);
        const syncEncrypted = await encryptApiKeyForSync(plainKey, oldPassword);
        await decryptApiKeyFromSync(syncEncrypted, oldPassword);
      } catch (error) {
        return {
          success: false,
          uploaded: 0,
          downloaded: 0,
          conflicts: 0,
          error: "Old password is incorrect",
        };
      }
    }

    // 3. Re-encrypt all keys with new password
    const deviceId = await getDeviceId();
    const encryptedKeys = [];

    for (const key of localKeys) {
      try {
        const plainKey = await decryptApiKey(key.key);
        const encryptedKey = await encryptApiKeyForSync(plainKey, newPassword);

        encryptedKeys.push({
          id: key.id,
          provider: key.provider,
          encryptedKey,
          label: key.label,
          baseUrl: key.baseUrl,
          version: Date.now(),
          deviceId,
          createdAt: key.createdAt,
          updatedAt: Date.now(),
        });
      } catch (error) {
        console.error(`[ApiKeySync] Failed to re-encrypt key ${key.id}:`, error);
      }
    }

    // 4. Upload to S3
    const bundle: EncryptedKeyBundle = {
      version: 1,
      deviceId,
      timestamp: Date.now(),
      keys: encryptedKeys,
    };

    await uploadKeysToS3(deviceId, bundle);

    // 5. Update hint
    await updateSettings({
      apiKeySyncHint: hint,
      lastApiKeySyncAt: Date.now(),
    });

    return {
      success: true,
      uploaded: encryptedKeys.length,
      downloaded: 0,
      conflicts: 0,
    };
  } catch (error) {
    console.error("[ApiKeySync] Change password failed:", error);
    return {
      success: false,
      uploaded: 0,
      downloaded: 0,
      conflicts: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
