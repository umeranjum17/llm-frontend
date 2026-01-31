/**
 * Cloud Sync Encryption Module
 *
 * Provides encryption/decryption for cloud sync data.
 * Reuses the existing settings-crypto module for consistency.
 */

// Re-export core encryption functions from settings-crypto
export {
  encryptSettings,
  decryptSettings,
  isValidEncryptedFormat,
  checkExpiration,
} from "@/lib/crypto/settings-crypto";

const PBKDF2_ITERATIONS = 100000;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const KEY_LENGTH = 256;

export interface EncryptedSyncData {
  version: number;
  salt: string;
  iv: string;
  data: string; // Base64 encoded encrypted blob
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
 * Derives an AES-256-GCM key from a password using PBKDF2
 */
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt.buffer as ArrayBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    passwordKey,
    { name: "AES-GCM", length: KEY_LENGTH },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypts a Blob for cloud storage
 *
 * @param data - The Blob to encrypt (database export)
 * @param password - The encryption password
 * @returns Encrypted data as a Blob
 */
export async function encryptSyncData(data: Blob, password: string): Promise<Blob> {
  // Read blob as ArrayBuffer
  const plaintext = new Uint8Array(await data.arrayBuffer());

  // Generate random salt and IV
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  // Derive key from password
  const key = await deriveKey(password, salt);

  // Encrypt the data
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
    key,
    plaintext
  );

  // Package the encrypted data
  const encryptedData: EncryptedSyncData = {
    version: 1,
    salt: arrayToBase64(salt),
    iv: arrayToBase64(iv),
    data: arrayToBase64(new Uint8Array(ciphertext)),
  };

  // Return as blob
  return new Blob([JSON.stringify(encryptedData)], { type: "application/json" });
}

/**
 * Decrypts sync data from cloud storage
 *
 * @param encryptedBlob - The encrypted Blob
 * @param password - The decryption password
 * @returns Decrypted data as a Blob
 */
export async function decryptSyncData(encryptedBlob: Blob, password: string): Promise<Blob> {
  // Read blob as text
  const encryptedText = await encryptedBlob.text();

  // Parse encrypted data
  const encryptedData: EncryptedSyncData = JSON.parse(encryptedText);

  // Check version compatibility
  if (encryptedData.version !== 1) {
    throw new Error(`Unsupported encryption version: ${encryptedData.version}`);
  }

  // Decode base64 values
  const salt = base64ToArray(encryptedData.salt);
  const iv = base64ToArray(encryptedData.iv);
  const ciphertext = base64ToArray(encryptedData.data);

  // Derive key from password
  const key = await deriveKey(password, salt);

  try {
    // Decrypt the data
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
      key,
      ciphertext.buffer as ArrayBuffer
    );

    // Return as blob (original database export format)
    return new Blob([plaintext], { type: "application/json" });
  } catch {
    throw new Error("Decryption failed. Please check your password.");
  }
}

/**
 * Encrypts sync data as a string (for S3 upload)
 *
 * @param data - String data to encrypt
 * @param password - The encryption password
 * @returns Encrypted data as a string
 */
export async function encryptSyncString(data: string, password: string): Promise<string> {
  const encoder = new TextEncoder();
  const plaintext = encoder.encode(data);

  // Generate random salt and IV
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  // Derive key from password
  const key = await deriveKey(password, salt);

  // Encrypt the data
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
    key,
    plaintext
  );

  // Package the encrypted data
  const encryptedData: EncryptedSyncData = {
    version: 1,
    salt: arrayToBase64(salt),
    iv: arrayToBase64(iv),
    data: arrayToBase64(new Uint8Array(ciphertext)),
  };

  return JSON.stringify(encryptedData);
}

/**
 * Decrypts sync string data
 *
 * @param encrypted - The encrypted string
 * @param password - The decryption password
 * @returns Decrypted string
 */
export async function decryptSyncString(encrypted: string, password: string): Promise<string> {
  // Parse encrypted data
  const encryptedData: EncryptedSyncData = JSON.parse(encrypted);

  // Check version compatibility
  if (encryptedData.version !== 1) {
    throw new Error(`Unsupported encryption version: ${encryptedData.version}`);
  }

  // Decode base64 values
  const salt = base64ToArray(encryptedData.salt);
  const iv = base64ToArray(encryptedData.iv);
  const ciphertext = base64ToArray(encryptedData.data);

  // Derive key from password
  const key = await deriveKey(password, salt);

  try {
    // Decrypt the data
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
      key,
      ciphertext.buffer as ArrayBuffer
    );

    // Decode and return
    const decoder = new TextDecoder();
    return decoder.decode(plaintext);
  } catch {
    throw new Error("Decryption failed. Please check your password.");
  }
}

/**
 * Checks if data is encrypted sync data
 */
export function isEncryptedSyncData(data: string): boolean {
  try {
    const parsed = JSON.parse(data);
    return (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof parsed.version === "number" &&
      typeof parsed.salt === "string" &&
      typeof parsed.iv === "string" &&
      typeof parsed.data === "string"
    );
  } catch {
    return false;
  }
}

/**
 * Storage key for encryption password in session
 * Password is only kept in memory/sessionStorage, never persisted
 */
const SYNC_PASSWORD_SESSION_KEY = "lumina_sync_password_session";

/**
 * Temporarily stores the sync password for the session
 * This is cleared when the browser tab closes
 */
export function setSessionPassword(password: string): void {
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.setItem(SYNC_PASSWORD_SESSION_KEY, password);
  }
}

/**
 * Retrieves the stored session password
 */
export function getSessionPassword(): string | null {
  if (typeof sessionStorage !== "undefined") {
    return sessionStorage.getItem(SYNC_PASSWORD_SESSION_KEY);
  }
  return null;
}

/**
 * Clears the stored session password
 */
export function clearSessionPassword(): void {
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.removeItem(SYNC_PASSWORD_SESSION_KEY);
  }
}

/**
 * Validates a password meets minimum requirements
 */
export function validateSyncPassword(password: string): {
  valid: boolean;
  error?: string;
} {
  if (!password || password.length < 8) {
    return {
      valid: false,
      error: "Password must be at least 8 characters",
    };
  }

  return { valid: true };
}
