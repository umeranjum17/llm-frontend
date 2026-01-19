/**
 * API Key encryption at rest using Web Crypto API
 * Uses a device-specific key derived from a persistent secret
 */

const DEVICE_SECRET_KEY = "lumina_device_secret";
const IV_LENGTH = 12;

/**
 * Gets or creates a device-specific secret for encryption
 * This secret is stored in localStorage and unique per browser/device
 */
function getDeviceSecret(): string {
  if (typeof window === "undefined") {
    throw new Error("API key encryption is only available in browser");
  }

  let secret = localStorage.getItem(DEVICE_SECRET_KEY);
  if (!secret) {
    // Generate a new random secret (32 bytes = 256 bits)
    const randomBytes = crypto.getRandomValues(new Uint8Array(32));
    secret = arrayToBase64(randomBytes);
    localStorage.setItem(DEVICE_SECRET_KEY, secret);
  }
  return secret;
}

/**
 * Derives an AES-GCM key from the device secret
 */
async function deriveKey(): Promise<CryptoKey> {
  const secret = getDeviceSecret();
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
      throw new Error("Invalid encrypted key format");
    }

    const iv = base64ToArray(parts[1]);
    const ciphertext = base64ToArray(parts[2]);
    const key = await deriveKey();

    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
      key,
      ciphertext.buffer as ArrayBuffer
    );

    const decoder = new TextDecoder();
    return decoder.decode(plaintext);
  } catch (error) {
    console.error("[API Key Crypto] Decryption failed:", error);
    // Re-throw the error so callers can detect decryption failures
    // This is important when device secret changes (e.g., after PWA reinstall)
    throw new Error(
      `Failed to decrypt API key: ${error instanceof Error ? error.message : "Unknown error"}. Device secret may have changed.`
    );
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
