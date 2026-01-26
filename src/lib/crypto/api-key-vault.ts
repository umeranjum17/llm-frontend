/**
 * Passphrase-protected API key vault (client-side only).
 *
 * This differs from `api-key-crypto.ts` (device-secret encryption):
 * - The vault key is derived from a user passphrase (PBKDF2) + random salt.
 * - Encrypted keys cannot be decrypted without user input.
 *
 * Format (string stored in DB):
 *   v2:{ivBase64}:{ciphertextBase64}
 *
 * Vault metadata (stored in settings):
 *   { version: 1, kdf: "PBKDF2-SHA256", iterations: number, salt: base64 }
 */

export const API_KEY_VAULT_PREFIX = "v2:";
export const API_KEY_VAULT_META_VERSION = 1 as const;

const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const KEY_LENGTH = 256;

// OWASP guidance changes over time; this is a reasonable 2025-era default.
export const DEFAULT_VAULT_PBKDF2_ITERATIONS = 310_000;

export interface ApiKeyVaultMetaV1 {
  version: typeof API_KEY_VAULT_META_VERSION;
  kdf: "PBKDF2-SHA256";
  iterations: number;
  salt: string; // base64
}

export type ApiKeyVaultMeta = ApiKeyVaultMetaV1;

function arrayToBase64(array: Uint8Array): string {
  return btoa(String.fromCharCode(...array));
}

function base64ToArray(base64: string): Uint8Array {
  const binary = atob(base64);
  const array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    array[i] = binary.charCodeAt(i);
  }
  return array;
}

export function createApiKeyVaultMeta(
  opts?: Partial<Pick<ApiKeyVaultMetaV1, "iterations">>
): ApiKeyVaultMetaV1 {
  if (typeof window === "undefined") {
    throw new Error("API key vault metadata can only be created in the browser");
  }

  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  return {
    version: API_KEY_VAULT_META_VERSION,
    kdf: "PBKDF2-SHA256",
    iterations: opts?.iterations ?? DEFAULT_VAULT_PBKDF2_ITERATIONS,
    salt: arrayToBase64(salt),
  };
}

export function isVaultEncryptedKey(storedKey: string): boolean {
  return typeof storedKey === "string" && storedKey.startsWith(API_KEY_VAULT_PREFIX);
}

export async function deriveVaultKey(
  passphrase: string,
  meta: ApiKeyVaultMeta,
  options?: { extractable?: boolean }
): Promise<CryptoKey> {
  if (typeof window === "undefined") {
    throw new Error("API key vault is only available in the browser");
  }

  if (!passphrase) {
    throw new Error("Passphrase is required");
  }

  if (!meta || meta.version !== API_KEY_VAULT_META_VERSION || meta.kdf !== "PBKDF2-SHA256") {
    throw new Error("Unsupported vault metadata");
  }

  const encoder = new TextEncoder();
  const normalized = passphrase.normalize("NFKC");

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(normalized),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  const salt = base64ToArray(meta.salt);

  const extractable = options?.extractable ?? false;

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt.buffer as ArrayBuffer,
      iterations: meta.iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: KEY_LENGTH },
    extractable,
    ["encrypt", "decrypt"]
  );
}

export async function encryptApiKeyWithVault(
  plainKey: string,
  vaultKey: CryptoKey
): Promise<string> {
  if (!plainKey) return plainKey;

  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
    vaultKey,
    encoder.encode(plainKey)
  );

  return `${API_KEY_VAULT_PREFIX}${arrayToBase64(iv)}:${arrayToBase64(new Uint8Array(ciphertext))}`;
}

export async function decryptApiKeyWithVault(
  storedKey: string,
  vaultKey: CryptoKey
): Promise<string> {
  if (!storedKey) return storedKey;

  if (!isVaultEncryptedKey(storedKey)) {
    throw new Error("Not a vault-encrypted key");
  }

  const parts = storedKey.split(":");
  if (parts.length !== 3 || parts[0] !== "v2") {
    throw new Error("Invalid vault key format");
  }

  const iv = base64ToArray(parts[1]);
  const ciphertext = base64ToArray(parts[2]);

  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
    vaultKey,
    ciphertext.buffer as ArrayBuffer
  );

  const decoder = new TextDecoder();
  return decoder.decode(plaintext);
}
