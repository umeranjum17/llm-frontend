/**
 * API Key encryption at rest using Web Crypto API
 * Uses a device-specific key derived from a persistent secret
 *
 * The device secret is stored in IndexedDB alongside the encrypted API keys
 * to ensure they are evicted together in PWA scenarios.
 */

import { db } from "@/lib/db/schema";

const DEVICE_SECRET_KEY = "lumina_device_secret";
const DEVICE_SECRET_ID = "device_secret";
const IV_LENGTH = 12;

// Cache the secret in memory to avoid repeated DB reads
let cachedSecret: string | null = null;

/**
 * Gets or creates a device-specific secret for encryption
 * Stores in IndexedDB to ensure it persists with the API keys (fixes PWA issue)
 * Also syncs to localStorage as a fallback
 */
async function getDeviceSecret(): Promise<string> {
  if (typeof window === "undefined") {
    throw new Error("API key encryption is only available in browser");
  }

  // Return cached secret if available
  if (cachedSecret) {
    return cachedSecret;
  }

  try {
    // Try to get from IndexedDB first (primary storage)
    const record = await db.deviceSecrets.get(DEVICE_SECRET_ID);
    if (record?.secret) {
      cachedSecret = record.secret;
      // Sync to localStorage as backup
      localStorage.setItem(DEVICE_SECRET_KEY, record.secret);
      return record.secret;
    }

    // Check localStorage for migration (existing users)
    const localStorageSecret = localStorage.getItem(DEVICE_SECRET_KEY);
    if (localStorageSecret) {
      // Migrate to IndexedDB
      await db.deviceSecrets.put({
        id: DEVICE_SECRET_ID,
        secret: localStorageSecret,
        createdAt: Date.now(),
      });
      cachedSecret = localStorageSecret;
      return localStorageSecret;
    }

    // Generate new secret if none exists
    const randomBytes = crypto.getRandomValues(new Uint8Array(32));
    const newSecret = arrayToBase64(randomBytes);

    // Store in both IndexedDB and localStorage
    await db.deviceSecrets.put({
      id: DEVICE_SECRET_ID,
      secret: newSecret,
      createdAt: Date.now(),
    });
    localStorage.setItem(DEVICE_SECRET_KEY, newSecret);

    cachedSecret = newSecret;
    return newSecret;
  } catch (error) {
    // Fallback to localStorage-only if IndexedDB fails
    console.warn("[API Key Crypto] IndexedDB access failed, using localStorage fallback:", error);

    let secret = localStorage.getItem(DEVICE_SECRET_KEY);
    if (!secret) {
      const randomBytes = crypto.getRandomValues(new Uint8Array(32));
      secret = arrayToBase64(randomBytes);
      localStorage.setItem(DEVICE_SECRET_KEY, secret);
    }
    cachedSecret = secret;
    return secret;
  }
}

/**
 * Derives an AES-GCM key from the device secret
 */
async function deriveKey(): Promise<CryptoKey> {
  const secret = await getDeviceSecret();
  const encoder = new TextEncoder();

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  // Use a fixed salt derived from the secret itself (first 16 chars)
  const salt = encoder.encode(secret.slice(0, 16));

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt.buffer as ArrayBuffer,
      iterations: 10000, // Lower iterations since secret is already random
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Converts a Uint8Array to a base64 string
 */
function arrayToBase64(array: Uint8Array): string {
  return btoa(String.fromCharCode(...array));
}

/**
 * Converts a base64 string to a Uint8Array
 */
function base64ToArray(base64: string): Uint8Array {
  const binary = atob(base64);
  const array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    array[i] = binary.charCodeAt(i);
  }
  return array;
}

/**
 * Encrypts an API key for storage
 * @returns Encrypted string in format: "v1:{iv}:{ciphertext}"
 */
export async function encryptApiKey(plainKey: string): Promise<string> {
  if (!plainKey) return plainKey;

  try {
    const encoder = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    const key = await deriveKey();

    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
      key,
      encoder.encode(plainKey)
    );

    const ivBase64 = arrayToBase64(iv);
    const ciphertextBase64 = arrayToBase64(new Uint8Array(ciphertext));

    return `v1:${ivBase64}:${ciphertextBase64}`;
  } catch (error) {
    console.error("[API Key Crypto] Encryption failed:", error);
    // Return plaintext if encryption fails (graceful degradation)
    return plainKey;
  }
}

/**
 * Decrypts an API key from storage
 * Handles both encrypted (v1:...) and plaintext keys for migration
 * @throws Error if decryption fails for an encrypted key (device secret may have changed)
 */
export async function decryptApiKey(storedKey: string): Promise<string> {
  if (!storedKey) return storedKey;

  // Check if it's an encrypted key (starts with version prefix)
  if (!storedKey.startsWith("v1:")) {
    // Plaintext key (legacy) - return as is
    return storedKey;
  }

  try {
    const parts = storedKey.split(":");
    if (parts.length !== 3) {
      throw new DecryptionError(
        "Invalid encrypted key format. The key may be corrupted.",
        "FORMAT_ERROR"
      );
    }

    let iv: Uint8Array;
    let ciphertext: Uint8Array;

    try {
      iv = base64ToArray(parts[1]);
      ciphertext = base64ToArray(parts[2]);
    } catch {
      throw new DecryptionError(
        "Could not decode encrypted key data. The key may be corrupted.",
        "DECODE_ERROR"
      );
    }

    const key = await deriveKey();

    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
      key,
      ciphertext.buffer as ArrayBuffer
    );

    const decoder = new TextDecoder();
    return decoder.decode(plaintext);
  } catch (error) {
    // If it's already our custom error, re-throw
    if (error instanceof DecryptionError) {
      throw error;
    }

    console.error("[API Key Crypto] Decryption failed:", error);

    // Provide specific error message based on the error type
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    if (errorMessage.includes("OperationError") || errorMessage.includes("decrypt")) {
      throw new DecryptionError(
        "Device encryption key has changed. This typically happens after clearing browser data or reinstalling the PWA. Please re-enter your API key.",
        "SECRET_CHANGED"
      );
    }

    throw new DecryptionError(
      `Failed to decrypt API key: ${errorMessage}`,
      "UNKNOWN_ERROR"
    );
  }
}

/**
 * Custom error class for decryption failures with error codes
 */
export class DecryptionError extends Error {
  code: "FORMAT_ERROR" | "DECODE_ERROR" | "SECRET_CHANGED" | "UNKNOWN_ERROR";

  constructor(message: string, code: DecryptionError["code"]) {
    super(message);
    this.name = "DecryptionError";
    this.code = code;
  }
}

/**
 * Checks if a stored key is encrypted
 */
export function isEncryptedKey(storedKey: string): boolean {
  return storedKey?.startsWith("v1:");
}

/**
 * Migrates a plaintext key to encrypted format
 * Returns the encrypted key if successful, or the original key on failure
 */
export async function migrateToEncrypted(plainKey: string): Promise<string> {
  if (isEncryptedKey(plainKey)) {
    return plainKey; // Already encrypted
  }
  return encryptApiKey(plainKey);
}

/**
 * Ensures the device secret is initialized and migrated from localStorage if needed
 * Call this early in app initialization to ensure the secret is available
 */
export async function initializeDeviceSecret(): Promise<void> {
  await getDeviceSecret();
}
