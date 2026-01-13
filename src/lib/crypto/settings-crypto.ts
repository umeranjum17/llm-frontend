/**
 * Secure settings encryption/decryption using Web Crypto API
 * Uses PBKDF2 for key derivation and AES-256-GCM for encryption
 */

const PBKDF2_ITERATIONS = 100000;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const KEY_LENGTH = 256;

export interface EncryptedData {
  version: number;
  salt: string;
  iv: string;
  data: string;
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
      salt,
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
 * Encrypts data with a password
 * @param data - The data object to encrypt
 * @param password - The encryption password
 * @returns Encrypted data as a JSON string
 */
export async function encryptSettings(data: object, password: string): Promise<string> {
  const encoder = new TextEncoder();
  const plaintext = encoder.encode(JSON.stringify(data));

  // Generate random salt and IV
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  // Derive key from password
  const key = await deriveKey(password, salt);

  // Encrypt the data
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    plaintext
  );

  // Package the encrypted data
  const encryptedData: EncryptedData = {
    version: 1,
    salt: arrayToBase64(salt),
    iv: arrayToBase64(iv),
    data: arrayToBase64(new Uint8Array(ciphertext)),
  };

  return JSON.stringify(encryptedData);
}

/**
 * Decrypts data with a password
 * @param encrypted - The encrypted JSON string
 * @param password - The decryption password
 * @returns The decrypted data object
 * @throws Error if decryption fails (wrong password or corrupted data)
 */
export async function decryptSettings(encrypted: string, password: string): Promise<object> {
  const encryptedData: EncryptedData = JSON.parse(encrypted);

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
      { name: "AES-GCM", iv },
      key,
      ciphertext
    );

    // Parse and return the decrypted JSON
    const decoder = new TextDecoder();
    return JSON.parse(decoder.decode(plaintext));
  } catch (error) {
    // AES-GCM will throw if the password is wrong (authentication tag mismatch)
    throw new Error("Decryption failed. Please check your password.");
  }
}

/**
 * Validates that a string is a valid encrypted settings file
 */
export function isValidEncryptedFormat(data: string): boolean {
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
