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
  expiresAt?: number; // Unix timestamp when this backup expires (optional)
}

export type ExpirationOption = "1d" | "7d" | "30d" | "never";
export type ShareLinkExpirationOption = "1h" | "6h" | "24h";

export function getExpirationTimestamp(option: ExpirationOption): number | undefined {
  const now = Date.now();
  switch (option) {
    case "1d":
      return now + 24 * 60 * 60 * 1000;
    case "7d":
      return now + 7 * 24 * 60 * 60 * 1000;
    case "30d":
      return now + 30 * 24 * 60 * 60 * 1000;
    case "never":
      return undefined;
  }
}

export function getShareLinkExpirationTimestamp(option: ShareLinkExpirationOption): number {
  const now = Date.now();
  switch (option) {
    case "1h":
      return now + 60 * 60 * 1000;
    case "6h":
      return now + 6 * 60 * 60 * 1000;
    case "24h":
      return now + 24 * 60 * 60 * 1000;
  }
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
 * Encrypts data with a password
 * @param data - The data object to encrypt
 * @param password - The encryption password
 * @param expiresAt - Optional expiration timestamp
 * @returns Encrypted data as a JSON string
 */
export async function encryptSettings(
  data: object,
  password: string,
  expiresAt?: number
): Promise<string> {
  const encoder = new TextEncoder();
  const plaintext = encoder.encode(JSON.stringify(data));

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
  const encryptedData: EncryptedData = {
    version: 1,
    salt: arrayToBase64(salt),
    iv: arrayToBase64(iv),
    data: arrayToBase64(new Uint8Array(ciphertext)),
    expiresAt,
  };

  return JSON.stringify(encryptedData);
}

/**
 * Checks if an encrypted backup has expired
 */
export function checkExpiration(encrypted: string): {
  isExpired: boolean;
  expiresAt?: Date;
  hasExpiration: boolean;
} {
  try {
    const data: EncryptedData = JSON.parse(encrypted);
    if (!data.expiresAt) {
      return { isExpired: false, hasExpiration: false };
    }
    return {
      isExpired: Date.now() > data.expiresAt,
      expiresAt: new Date(data.expiresAt),
      hasExpiration: true,
    };
  } catch {
    return { isExpired: false, hasExpiration: false };
  }
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

  // Check expiration
  if (encryptedData.expiresAt && Date.now() > encryptedData.expiresAt) {
    const expiredDate = new Date(encryptedData.expiresAt).toLocaleDateString();
    throw new Error(`This backup expired on ${expiredDate}. Please create a new export.`);
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

// ============================================
// Shareable URL Functions
// ============================================

/**
 * Converts a string to URL-safe base64
 * Replaces + with -, / with _, and removes = padding
 */
function toUrlSafeBase64(str: string): string {
  return btoa(str)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Converts URL-safe base64 back to regular string
 */
function fromUrlSafeBase64(str: string): string {
  // Add back padding if needed
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padding = base64.length % 4;
  if (padding) {
    base64 += "=".repeat(4 - padding);
  }
  return atob(base64);
}

/**
 * Compresses a string using gzip (browser native)
 */
async function compressString(str: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(str));
      controller.close();
    },
  });
  const compressedStream = stream.pipeThrough(new CompressionStream("gzip"));
  const reader = compressedStream.getReader();
  const chunks: Uint8Array[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

/**
 * Decompresses gzipped data back to string
 */
async function decompressString(data: Uint8Array): Promise<string> {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(data);
      controller.close();
    },
  });
  const decompressedStream = stream.pipeThrough(new DecompressionStream("gzip"));
  const reader = decompressedStream.getReader();
  const chunks: Uint8Array[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  const decoder = new TextDecoder();
  return chunks.map(chunk => decoder.decode(chunk, { stream: true })).join("") + decoder.decode();
}

/**
 * Creates a shareable URL containing encrypted settings
 * Uses compression to minimize URL length
 * @param settings - Settings object to encrypt
 * @param password - Password for encryption
 * @param expiresAt - Expiration timestamp (required for share links)
 * @returns The shareable URL
 */
export async function createShareableUrl(
  settings: object,
  password: string,
  expiresAt: number
): Promise<string> {
  // Encrypt the settings
  const encrypted = await encryptSettings(settings, password, expiresAt);

  // Compress the encrypted JSON
  const compressed = await compressString(encrypted);

  // Convert to URL-safe base64
  const base64 = toUrlSafeBase64(String.fromCharCode(...compressed));

  // Build the URL with hash fragment (data never sent to server)
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/import#${base64}`;
}

/**
 * Parses encrypted settings from a shareable URL hash
 * @param hash - The URL hash (without the # prefix)
 * @returns The encrypted JSON string, or null if invalid
 */
export async function parseShareableUrl(hash: string): Promise<string | null> {
  try {
    if (!hash) return null;

    // Decode from URL-safe base64
    const decoded = fromUrlSafeBase64(hash);

    // Convert string back to Uint8Array
    const compressed = new Uint8Array(decoded.length);
    for (let i = 0; i < decoded.length; i++) {
      compressed[i] = decoded.charCodeAt(i);
    }

    // Decompress
    const encrypted = await decompressString(compressed);

    // Validate it's proper encrypted format
    if (!isValidEncryptedFormat(encrypted)) {
      return null;
    }

    return encrypted;
  } catch (error) {
    console.error("[ShareableURL] Failed to parse:", error);
    return null;
  }
}

/**
 * Estimates the URL length for given settings (for UI warnings)
 */
export async function estimateShareableUrlLength(settings: object): Promise<number> {
  const json = JSON.stringify(settings);
  // Rough estimate: encryption adds ~30% overhead, compression removes ~50%, base64 adds ~33%
  // Actual: encrypt JSON, compress, then base64
  const estimatedCompressed = json.length * 0.5; // Assume 50% compression
  const estimatedBase64 = Math.ceil(estimatedCompressed * 1.33);
  return "/import#".length + estimatedBase64;
}
