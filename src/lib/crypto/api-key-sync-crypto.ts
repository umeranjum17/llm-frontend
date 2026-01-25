/**
 * Secure API key encryption/decryption for sync
 * Uses PBKDF2 for key derivation and AES-256-GCM for encryption
 */

const PBKDF2_ITERATIONS = 100000;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const KEY_LENGTH = 256;

export interface PasswordValidationResult {
  valid: boolean;
  score: number; // 0-4
  errors: string[];
}

/**
 * Validates a sync password for strength and complexity
 * Requirements:
 * - Minimum 12 characters
 * - Contains uppercase letter
 * - Contains lowercase letter
 * - Contains number
 * - Contains special character
 *
 * Score calculation:
 * - 0: Too weak (doesn't meet minimum requirements)
 * - 1: Weak (meets minimum but short)
 * - 2: Fair (12-15 chars with requirements)
 * - 3: Good (16+ chars with good variety)
 * - 4: Strong (20+ chars with excellent variety)
 */
export function validateSyncPassword(password: string): PasswordValidationResult {
  const errors: string[] = [];
  let score = 0;

  // Check minimum length
  if (password.length < 12) {
    errors.push("Password must be at least 12 characters long");
    return { valid: false, score: 0, errors };
  }

  // Check complexity requirements
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);

  if (!hasUppercase) errors.push("Password must contain an uppercase letter");
  if (!hasLowercase) errors.push("Password must contain a lowercase letter");
  if (!hasNumber) errors.push("Password must contain a number");
  if (!hasSpecial) errors.push("Password must contain a special character");

  // If missing required characters, score is 0
  if (errors.length > 0) {
    return { valid: false, score: 0, errors };
  }

  // Calculate score based on length and variety
  const charVariety = [hasUppercase, hasLowercase, hasNumber, hasSpecial].filter(Boolean).length;

  if (password.length >= 20 && charVariety === 4) {
    score = 4; // Strong
  } else if (password.length >= 16 && charVariety >= 3) {
    score = 3; // Good
  } else if (password.length >= 12) {
    score = 2; // Fair
  } else {
    score = 1; // Weak (shouldn't reach here due to length check above)
  }

  // Check for common patterns that reduce strength
  const hasRepeatingChars = /(.)\1{2,}/.test(password);
  const hasSequentialChars = /(abc|bcd|cde|123|234|345|456|567|678|789)/i.test(password);

  if (hasRepeatingChars || hasSequentialChars) {
    score = Math.max(1, score - 1);
  }

  return { valid: true, score, errors: [] };
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
 * Encrypts an API key with a sync password
 * @param plainKey - The API key to encrypt
 * @param password - The sync password
 * @returns Encrypted string in format: "v1:{salt}:{iv}:{data}"
 */
export async function encryptApiKeyForSync(
  plainKey: string,
  password: string
): Promise<string> {
  const encoder = new TextEncoder();
  const plaintext = encoder.encode(plainKey);

  // Generate random salt and IV
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  // Derive key from password
  const key = await deriveKey(password, salt);

  // Encrypt the API key
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
    key,
    plaintext
  );

  // Return in v1:{salt}:{iv}:{data} format
  return `v1:${arrayToBase64(salt)}:${arrayToBase64(iv)}:${arrayToBase64(
    new Uint8Array(ciphertext)
  )}`;
}

/**
 * Decrypts an API key with a sync password
 * @param encrypted - The encrypted string in format "v1:{salt}:{iv}:{data}"
 * @param password - The sync password
 * @returns The decrypted API key
 * @throws Error if decryption fails (wrong password or corrupted data)
 */
export async function decryptApiKeyFromSync(
  encrypted: string,
  password: string
): Promise<string> {
  // Parse the encrypted format
  const parts = encrypted.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("Invalid encrypted format");
  }

  const [, saltBase64, ivBase64, dataBase64] = parts;

  // Decode base64 values
  const salt = base64ToArray(saltBase64);
  const iv = base64ToArray(ivBase64);
  const ciphertext = base64ToArray(dataBase64);

  // Derive key from password
  const key = await deriveKey(password, salt);

  try {
    // Decrypt the API key
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
      key,
      ciphertext.buffer as ArrayBuffer
    );

    // Return the decrypted string
    const decoder = new TextDecoder();
    return decoder.decode(plaintext);
  } catch (error) {
    // AES-GCM will throw if the password is wrong (authentication tag mismatch)
    throw new Error("Decryption failed. Please check your password.");
  }
}

/**
 * Validates that a string is in the correct encrypted format
 */
export function isValidEncryptedFormat(encrypted: string): boolean {
  const parts = encrypted.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") {
    return false;
  }

  // Check that salt, iv, and data are valid base64
  const [, salt, iv, data] = parts;
  try {
    base64ToArray(salt);
    base64ToArray(iv);
    base64ToArray(data);
    return true;
  } catch {
    return false;
  }
}
