import { create } from "zustand";
import {
  getAllApiKeys,
  getApiKeyByProvider,
  addApiKey as dbAddApiKey,
  deleteApiKey as dbDeleteApiKey,
  updateApiKey as dbUpdateApiKey,
  getSettings,
  updateSettings,
} from "@/lib/db/queries";
import type { ApiKey } from "@/lib/db/schema";

export const SYNC_S3_PROVIDER = "sync-s3";

export interface S3SyncConfig {
  endpoint: string;
  bucket: string;
  region?: string;
  accessKeyId: string;
  secretAccessKey: string;
}
import {
  encryptApiKey,
  decryptApiKey,
  isEncryptedKey,
  DecryptionError,
} from "@/lib/crypto/api-key-crypto";
import type { ApiKeyVaultMeta } from "@/lib/crypto/api-key-vault";
import {
  createApiKeyVaultMeta,
  createVaultVerificationHash,
  decryptApiKeyWithVault,
  deriveVaultKey,
  encryptApiKeyWithVault,
  isVaultEncryptedKey,
  verifyVaultKey,
} from "@/lib/crypto/api-key-vault";
import { initializeDeviceSecret } from "@/lib/crypto/api-key-crypto";
import type { ApiKeyVaultPasskey } from "@/lib/crypto/vault-passkey";
import {
  createVaultPasskey,
  unwrapVaultKeyWithPasskey,
} from "@/lib/crypto/vault-passkey";
import { toast } from "sonner";

interface ApiKeysState {
  keys: ApiKey[];
  isLoaded: boolean;
  vault: {
    meta: ApiKeyVaultMeta | null;
    passkey: ApiKeyVaultPasskey | null;
    isUnlocked: boolean;
    unlockedUntil: number | null;
    rememberMs: number;
  };
  vaultKeyIds: string[];
  lockedKeyIds: string[];
  vaultUnlockRequest: { providerId?: string } | null;

  // Actions
  loadKeys: () => Promise<void>;
  getKeyForProvider: (provider: string) => ApiKey | undefined;
  isProviderKeyLocked: (provider: string) => boolean;
  requestVaultUnlock: (providerId?: string) => void;
  clearVaultUnlockRequest: () => void;
  addKey: (provider: string, key: string, label?: string, baseUrl?: string) => Promise<void>;
  removeKey: (id: string) => Promise<void>;
  hasKey: (provider: string) => boolean;
  unlockVault: (passphrase: string, rememberMs?: number) => Promise<void>;
  unlockVaultWithPasskey: (rememberMs?: number) => Promise<void>;
  lockVault: () => void;
  enableVault: (passphrase: string, rememberMs?: number) => Promise<void>;
  disableVault: (passphrase: string) => Promise<void>;
  setVaultRememberMs: (rememberMs: number) => Promise<void>;
  setupVaultPasskey: (passphrase?: string) => Promise<void>;
  removeVaultPasskey: () => Promise<void>;
  resetVault: () => Promise<void>;
  // S3 sync credentials (stored as special API key)
  getS3Config: () => S3SyncConfig | null;
  setS3Config: (config: S3SyncConfig) => Promise<void>;
  removeS3Config: () => Promise<void>;
  isS3ConfigLocked: () => boolean;
  isS3ConfigAvailable: () => boolean;
}

let cachedVaultKey: CryptoKey | null = null;
let vaultAutoLockTimeout: ReturnType<typeof setTimeout> | null = null;
let vaultSessionExpiresAt: number | null = null;

const VAULT_SESSION_STORAGE_KEY = "apiKeyVaultSession";
const DEFAULT_REMEMBER_MS = 24 * 60 * 60 * 1000;

interface EncryptedVaultSessionPayload {
  version: 2;
  salt: string;
  iv: string;
  ciphertext: string;
  expiresAt: number;
}

class VaultUnlockError extends Error {
  code: "WRONG_PASSPHRASE" | "VAULT_CORRUPTED" | "UNKNOWN";

  constructor(message: string, code: VaultUnlockError["code"]) {
    super(message);
    this.name = "VaultUnlockError";
    this.code = code;
  }
}

function canUseSessionStorage() {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

function clearVaultSession() {
  vaultSessionExpiresAt = null;
  if (!canUseSessionStorage()) return;
  try {
    window.sessionStorage.removeItem(VAULT_SESSION_STORAGE_KEY);
  } catch {
    // Ignore storage errors.
  }
}

function scheduleVaultAutoLock(lockAt: number, lock: () => void) {
  if (vaultAutoLockTimeout) clearTimeout(vaultAutoLockTimeout);
  const delay = Math.max(0, lockAt - Date.now());
  vaultAutoLockTimeout = setTimeout(lock, delay);
}

function normalizeVaultMeta(meta: unknown): ApiKeyVaultMeta | null {
  if (!meta || typeof meta !== "object") return null;
  const candidate = meta as {
    version?: unknown;
    kdf?: unknown;
    iterations?: unknown;
    salt?: unknown;
    verificationHash?: unknown;
  };
  if (candidate.kdf !== "PBKDF2-SHA256") return null;
  if (candidate.version === 1) {
    if (typeof candidate.iterations !== "number" || typeof candidate.salt !== "string") return null;
    return {
      version: 1,
      kdf: "PBKDF2-SHA256",
      iterations: candidate.iterations,
      salt: candidate.salt,
    };
  }
  if (candidate.version === 2) {
    if (typeof candidate.iterations !== "number" || typeof candidate.salt !== "string") return null;
    if (typeof candidate.verificationHash !== "string") return null;
    return {
      version: 2,
      kdf: "PBKDF2-SHA256",
      iterations: candidate.iterations,
      salt: candidate.salt,
      verificationHash: candidate.verificationHash,
    };
  }
  return null;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

async function getSessionEncryptionKey(salt: Uint8Array): Promise<CryptoKey> {
  await initializeDeviceSecret();
  const deviceSecret = localStorage.getItem("lumina_device_secret") ?? "";
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(deviceSecret),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  const saltBuffer = new Uint8Array(salt).buffer as ArrayBuffer;
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: saltBuffer, iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function persistVaultSession(
  vaultKey: CryptoKey,
  expiresAt: number
): Promise<void> {
  if (!canUseSessionStorage()) return;

  try {
    const rawKey = await crypto.subtle.exportKey("raw", vaultKey);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const sessionKey = await getSessionEncryptionKey(salt);

    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv.buffer },
      sessionKey,
      rawKey
    );

    const payload: EncryptedVaultSessionPayload = {
      version: 2,
      salt: arrayBufferToBase64(salt.buffer),
      iv: arrayBufferToBase64(iv.buffer),
      ciphertext: arrayBufferToBase64(ciphertext),
      expiresAt,
    };

    window.sessionStorage.setItem(VAULT_SESSION_STORAGE_KEY, JSON.stringify(payload));
    vaultSessionExpiresAt = expiresAt;
  } catch (error) {
    console.warn("[API Keys] Failed to persist vault session:", error);
  }
}

async function restoreVaultSession(): Promise<{ key: CryptoKey; expiresAt: number } | null> {
  if (!canUseSessionStorage()) return null;

  const stored = window.sessionStorage.getItem(VAULT_SESSION_STORAGE_KEY);
  if (!stored) return null;

  try {
    const payload = JSON.parse(stored) as EncryptedVaultSessionPayload;
    if (payload.version !== 2) {
      clearVaultSession();
      return null;
    }

    if (payload.expiresAt <= Date.now()) {
      clearVaultSession();
      return null;
    }

    const salt = new Uint8Array(base64ToArrayBuffer(payload.salt));
    const sessionKey = await getSessionEncryptionKey(salt);
    const rawKey = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToArrayBuffer(payload.iv) },
      sessionKey,
      base64ToArrayBuffer(payload.ciphertext)
    );

    const key = await crypto.subtle.importKey(
      "raw",
      rawKey,
      { name: "AES-GCM" },
      false,
      ["encrypt", "decrypt"]
    );

    return { key, expiresAt: payload.expiresAt };
  } catch (error) {
    console.warn("[API Keys] Failed to restore vault session:", error);
    clearVaultSession();
    return null;
  }
}

export const useApiKeysStore = create<ApiKeysState>((set, get) => ({
  keys: [],
  isLoaded: false,
  vault: {
    meta: null,
    passkey: null,
    isUnlocked: false,
    unlockedUntil: null,
    rememberMs: DEFAULT_REMEMBER_MS,
  },
  vaultKeyIds: [],
  lockedKeyIds: [],
  vaultUnlockRequest: null,

  loadKeys: async () => {
    const maxRetries = 3;
    let retryCount = 0;
    
    const attemptLoad = async (): Promise<void> => {
      try {
        const [settings, encryptedKeys] = await Promise.all([
          getSettings(),
          getAllApiKeys() as Promise<ApiKey[]>,
        ]);

        const vaultMeta = normalizeVaultMeta(settings.apiKeyVault ?? null);
        const vaultPasskey = vaultMeta ? settings.apiKeyVaultPasskey ?? null : null;
        const rememberMs = settings.apiKeyVaultRememberMs ?? get().vault.rememberMs;

        if (!vaultMeta) {
          cachedVaultKey = null;
          clearVaultSession();
        }

        const now = Date.now();
        let isVaultUnlocked = false;
        let unlockedUntil: number | null = null;
        if (vaultMeta) {
          const session = await restoreVaultSession();
          if (session && session.expiresAt > now) {
            cachedVaultKey = session.key;
            vaultSessionExpiresAt = session.expiresAt;
            isVaultUnlocked = true;
            unlockedUntil = session.expiresAt;
          }
        }

        if (isVaultUnlocked && typeof unlockedUntil === "number") {
          scheduleVaultAutoLock(unlockedUntil, () => get().lockVault());
        }

        /**
         * PERFORMANCE CRITICAL - Parallel Decryption
         *
         * Previously, keys were decrypted SEQUENTIALLY in a for loop:
         *   for (const key of keys) {
         *     await decryptApiKey(key);  // Blocks until done
         *   }
         *
         * With 5+ providers, this added 500ms+ to startup.
         * Now we decrypt ALL keys in parallel with Promise.all().
         *
         * Also, plaintext key migration now runs in background (fire-and-forget)
         * instead of blocking the load.
         */
        const decryptedKeys: ApiKey[] = [];
        const failedDecryptionKeys: { provider: string; code: string; message: string }[] = [];
        const keysToDelete: string[] = [];
        const vaultKeyIds: string[] = [];
        const lockedKeyIds: string[] = [];

        // Split keys by encryption scheme first (vault keys require passphrase)
        const nonVaultKeys = encryptedKeys.filter((k: ApiKey) => !isVaultEncryptedKey(k.key));
        const vaultKeys = encryptedKeys.filter((k: ApiKey) => isVaultEncryptedKey(k.key));

        // Handle vault keys (locked by default)
        for (const storedKey of vaultKeys) {
          vaultKeyIds.push(storedKey.id);

          if (isVaultUnlocked && cachedVaultKey) {
            try {
              const decryptedValue = await decryptApiKeyWithVault(storedKey.key, cachedVaultKey);
              decryptedKeys.push({ ...storedKey, key: decryptedValue });
            } catch (error) {
              const message = error instanceof Error ? error.message : "Failed to decrypt vault key";
              console.warn(`[API Keys] Vault decryption failed for ${storedKey.provider}:`, message);
              // Keep it locked, but preserve the row so user can re-enter/recover.
              lockedKeyIds.push(storedKey.id);
              decryptedKeys.push({ ...storedKey, key: "" });
            }
          } else {
            lockedKeyIds.push(storedKey.id);
            decryptedKeys.push({ ...storedKey, key: "" });
          }
        }

        // Process non-vault keys in PARALLEL (device-secret encryption)
        const decryptionResults = await Promise.all(
          nonVaultKeys.map(async (storedKey: ApiKey) => {
            try {
              const decryptedKeyValue = await decryptApiKey(storedKey.key);

              // Migrate plaintext keys to encrypted format (don't await, do in background)
              if (!isEncryptedKey(storedKey.key)) {
                encryptApiKey(decryptedKeyValue)
                  .then((encryptedValue) =>
                    dbUpdateApiKey(storedKey.id, { key: encryptedValue })
                  )
                  .catch(() => {});
              }

              return {
                success: true as const,
                key: { ...storedKey, key: decryptedKeyValue },
              };
            } catch (error) {
              const isDecryptionError = error instanceof DecryptionError;
              const errorMessage = error instanceof Error ? error.message : "Unknown error";
              const errorCode = isDecryptionError ? (error as DecryptionError).code : "UNKNOWN_ERROR";

              // If it's an encrypted key and decryption failed, mark for deletion
              if (isEncryptedKey(storedKey.key)) {
                console.warn(
                  `[API Keys] Decryption failed for ${storedKey.provider} (${errorCode}):`,
                  errorMessage
                );
                return {
                  success: false as const,
                  storedKey,
                  error: { provider: storedKey.provider, code: errorCode, message: errorMessage },
                };
              }

              // For plaintext keys, include as-is (graceful degradation)
              console.warn(
                `[API Keys] Error processing plaintext key for ${storedKey.provider}:`,
                errorMessage
              );
              return { success: true as const, key: storedKey };
            }
          })
        );

        // Collect results
        for (const result of decryptionResults) {
          if (result.success) {
            decryptedKeys.push(result.key);
          } else {
            failedDecryptionKeys.push(result.error);
            keysToDelete.push(result.storedKey.id);
          }
        }

        // Delete orphaned keys that can't be decrypted
        if (keysToDelete.length > 0) {
          console.log(`[API Keys] Cleaning up ${keysToDelete.length} orphaned keys...`);
          for (const id of keysToDelete) {
            try {
              await dbDeleteApiKey(id);
            } catch (e) {
              console.warn(`[API Keys] Failed to delete orphaned key ${id}:`, e);
            }
          }
        }

        // Show actionable toast if any keys were cleaned up
        if (failedDecryptionKeys.length > 0) {
          const providerNames = failedDecryptionKeys.map(k => k.provider).join(", ");
          const hasSecretChanged = failedDecryptionKeys.some(k => k.code === "SECRET_CHANGED");

          const description = hasSecretChanged
            ? `Browser encryption key changed (cache cleared or PWA reinstalled). Please re-enter API keys for: ${providerNames}`
            : `Could not decrypt keys for: ${providerNames}. Please re-enter these API keys.`;

          toast.error("API Keys Need Re-entry", {
            description,
            duration: 15000,
            action: {
              label: "Go to Settings",
              onClick: () => window.location.href = "/settings",
            },
          });
        }

        // Keep vault keys at the top of the in-memory list for discoverability in Settings.
        const orderedKeys = [
          ...decryptedKeys.filter((k) => vaultKeyIds.includes(k.id)),
          ...decryptedKeys.filter((k) => !vaultKeyIds.includes(k.id)),
        ];

        // Deduplicate keys by provider (keep most recent, delete duplicates from DB)
        const seenProviders = new Map<string, ApiKey>();
        const duplicateIds: string[] = [];
        for (const key of orderedKeys) {
          const existing = seenProviders.get(key.provider);
          if (existing) {
            // Keep the one with higher createdAt, mark the other for deletion
            if ((key.createdAt || 0) > (existing.createdAt || 0)) {
              duplicateIds.push(existing.id);
              seenProviders.set(key.provider, key);
            } else {
              duplicateIds.push(key.id);
            }
          } else {
            seenProviders.set(key.provider, key);
          }
        }
        const deduplicatedKeys = orderedKeys.filter((k) => !duplicateIds.includes(k.id));

        // Clean up duplicates from DB in background
        if (duplicateIds.length > 0) {
          console.log(`[API Keys] Cleaning up ${duplicateIds.length} duplicate keys...`);
          Promise.all(duplicateIds.map((id) => dbDeleteApiKey(id).catch(() => {})));
        }

        set({
          keys: deduplicatedKeys,
          isLoaded: true,
          vault: {
            meta: vaultMeta,
            passkey: vaultPasskey,
            isUnlocked: isVaultUnlocked,
            unlockedUntil: isVaultUnlocked ? unlockedUntil ?? null : null,
            rememberMs,
          },
          vaultKeyIds,
          lockedKeyIds: isVaultUnlocked ? lockedKeyIds : vaultKeyIds,
        });
      } catch (error) {
        const errorObj = error as Error;
        const errorName = errorObj?.name || "UnknownError";

        console.warn(`[API Keys Store] Failed to load keys (attempt ${retryCount + 1}/${maxRetries + 1}):`, errorObj?.message);

        // Check if it's a DB-related error
        const isDBError = 
          errorName === "DatabaseClosedError" ||
          errorName === "InvalidStateError" ||
          errorName === "VersionError" ||
          errorObj?.message?.includes("database");

        if (isDBError && retryCount < maxRetries) {
          // Retry with fast backoff (500ms, 1s, 1.5s max)
          retryCount++;
          const backoffMs = Math.min(500 * retryCount, 1500);
          console.log(`[API Keys Store] Retrying in ${backoffMs}ms...`);
          await new Promise(resolve => setTimeout(resolve, backoffMs));
          return attemptLoad(); // Recursive retry
        } else if (isDBError) {
          // DB health hook will handle recovery, but we should still set defaults
          console.warn("[API Keys Store] Max retries reached, using empty keys");
          set({ keys: [], isLoaded: true }); // Mark as loaded to prevent UI hang
        } else {
          // Re-throw non-DB errors
          throw error;
        }
      }
    };
    
    return attemptLoad();
  },

  getKeyForProvider: (provider) => {
    return get().keys.find((k) => k.provider === provider);
  },

  isProviderKeyLocked: (provider) => {
    const state = get();
    const key = state.keys.find((k) => k.provider === provider);
    if (!key) return false;
    return state.lockedKeyIds.includes(key.id);
  },

  requestVaultUnlock: (providerId) => {
    const state = get();
    if (!state.vault.meta || state.vault.isUnlocked) {
      return;
    }
    set({ vaultUnlockRequest: { providerId } });
  },

  clearVaultUnlockRequest: () => {
    set({ vaultUnlockRequest: null });
  },

  addKey: async (provider, key, label, baseUrl) => {
    const { vault, keys } = get();

    // System providers that should only have one key
    const singleKeyProviders = [SYNC_S3_PROVIDER, "composio"];
    const isSingleKeyProvider = singleKeyProviders.includes(provider);

    // Find existing key to replace:
    // - For system providers: any key with same provider
    // - For other providers: key with same provider AND same label (or both no label)
    const existing = keys.find((k) => {
      if (k.provider !== provider) return false;
      if (isSingleKeyProvider) return true;
      // For regular providers, match by label (treat undefined/empty as same)
      const existingLabel = k.label || "";
      const newLabel = label || "";
      return existingLabel === newLabel;
    });

    if (existing) {
      // Remove existing key first (will be replaced)
      await dbDeleteApiKey(existing.id);
      set({
        keys: keys.filter((k) => k.id !== existing.id),
        vaultKeyIds: get().vaultKeyIds.filter((k) => k !== existing.id),
        lockedKeyIds: get().lockedKeyIds.filter((k) => k !== existing.id),
      });
    }

    // If vault is configured, require it to be unlocked to add keys.
    if (vault.meta) {
      if (!vault.isUnlocked || !cachedVaultKey) {
        throw new Error("Vault is locked. Unlock it to add API keys.");
      }

      const encryptedKey = await encryptApiKeyWithVault(key, cachedVaultKey);
      const newKey = await dbAddApiKey({ provider, key: encryptedKey, label, baseUrl });
      set({
        keys: [...get().keys, { ...newKey, key }],
        vaultKeyIds: [...get().vaultKeyIds, newKey.id],
        lockedKeyIds: get().lockedKeyIds.filter((id) => id !== newKey.id),
      });
      return;
    }

    // Default: device-secret encryption.
    const encryptedKey = await encryptApiKey(key);
    const newKey = await dbAddApiKey({ provider, key: encryptedKey, label, baseUrl });

    // Store decrypted key in memory for immediate use
    set({
      keys: [
        ...get().keys,
        { ...newKey, key }, // Use plaintext key in memory
      ],
    });
  },

  removeKey: async (id) => {
    await dbDeleteApiKey(id);
    set({
      keys: get().keys.filter((k) => k.id !== id),
      vaultKeyIds: get().vaultKeyIds.filter((k) => k !== id),
      lockedKeyIds: get().lockedKeyIds.filter((k) => k !== id),
    });
  },

  hasKey: (provider) => {
    return get().keys.some((k) => k.provider === provider);
  },

  setVaultRememberMs: async (rememberMs: number) => {
    await updateSettings({ apiKeyVaultRememberMs: rememberMs });
    const vaultState = get().vault;
    if (vaultState.isUnlocked && typeof vaultState.unlockedUntil === "number") {
      const newUnlockedUntil = Date.now() + rememberMs;
      scheduleVaultAutoLock(newUnlockedUntil, () => get().lockVault());
      set({ vault: { ...vaultState, rememberMs, unlockedUntil: newUnlockedUntil } });
      return;
    }
    set({ vault: { ...vaultState, rememberMs } });
  },

  unlockVault: async (passphrase: string, rememberMs?: number) => {
    const settings = await getSettings();
    const meta = normalizeVaultMeta(settings.apiKeyVault ?? null);
    if (!meta) {
      throw new Error("Vault is not enabled");
    }

    let effectiveMeta = meta;
    const verifyKey = await deriveVaultKey(passphrase, meta, { extractable: true });

    if (meta.version === 2) {
      const verified = await verifyVaultKey(verifyKey, meta);
      if (!verified) {
        throw new VaultUnlockError("Incorrect passphrase. Please try again.", "WRONG_PASSPHRASE");
      }
    } else {
      const testKeyId = get().vaultKeyIds[0];
      if (testKeyId) {
        const testKey = get().keys.find((k) => k.id === testKeyId);
        if (testKey) {
          try {
            await decryptApiKeyWithVault(testKey.key, verifyKey);
          } catch (error) {
            throw new VaultUnlockError("Incorrect passphrase. Please try again.", "WRONG_PASSPHRASE");
          }
        }
      }

      const verificationHash = await createVaultVerificationHash(verifyKey);
      effectiveMeta = {
        ...meta,
        version: 2,
        verificationHash,
      };
      await updateSettings({ apiKeyVault: effectiveMeta });
    }

    const vaultKey = await deriveVaultKey(passphrase, effectiveMeta);
    cachedVaultKey = vaultKey;

    const allKeys: ApiKey[] = await getAllApiKeys();
    const vaultKeys = allKeys.filter((k) => isVaultEncryptedKey(k.key));

    let decryptedVaultKeys: ApiKey[] = [];
    try {
      decryptedVaultKeys = await Promise.all(
        vaultKeys.map(async (k) => {
          const decrypted = await decryptApiKeyWithVault(k.key, vaultKey);
          return { ...k, key: decrypted };
        })
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to decrypt vault keys";
      throw new VaultUnlockError(message, "VAULT_CORRUPTED");
    }

    const otherKeys = allKeys.filter((k) => !isVaultEncryptedKey(k.key));
    const decryptedOther = await Promise.all(
      otherKeys.map(async (k) => {
        try {
          const decrypted = await decryptApiKey(k.key);
          return { ...k, key: decrypted };
        } catch {
          return k;
        }
      })
    );

    const effectiveRememberMs = rememberMs ?? get().vault.rememberMs ?? DEFAULT_REMEMBER_MS;
    const newUnlockedUntil = Date.now() + effectiveRememberMs;
    scheduleVaultAutoLock(newUnlockedUntil, () => get().lockVault());
    await persistVaultSession(verifyKey, newUnlockedUntil);

    set({
      keys: [...decryptedVaultKeys, ...decryptedOther],
      vault: {
        meta: effectiveMeta,
        passkey: settings.apiKeyVaultPasskey ?? get().vault.passkey,
        isUnlocked: true,
        unlockedUntil: newUnlockedUntil,
        rememberMs: effectiveRememberMs,
      },
      vaultKeyIds: vaultKeys.map((k) => k.id),
      lockedKeyIds: [],
      vaultUnlockRequest: null,
    });
  },

  unlockVaultWithPasskey: async (rememberMs?: number) => {
    const settings = await getSettings();
    const meta = normalizeVaultMeta(settings.apiKeyVault ?? null);
    const passkey = settings.apiKeyVaultPasskey;
    if (!meta) {
      throw new Error("Vault is not enabled");
    }
    if (!passkey) {
      throw new Error("No passkey is set up for this vault");
    }

    const { rawVaultKey } = await unwrapVaultKeyWithPasskey(passkey);
    const vaultKey = await crypto.subtle.importKey(
      "raw",
      rawVaultKey,
      { name: "AES-GCM" },
      false,
      ["encrypt", "decrypt"]
    );
    const exportableVaultKey = await crypto.subtle.importKey(
      "raw",
      rawVaultKey,
      { name: "AES-GCM" },
      true,
      ["encrypt", "decrypt"]
    );
    const verified = await verifyVaultKey(exportableVaultKey, meta);
    if (!verified) {
      throw new VaultUnlockError("Passkey could not unlock this vault", "WRONG_PASSPHRASE");
    }
    cachedVaultKey = vaultKey;

    const allKeys: ApiKey[] = await getAllApiKeys();
    const vaultKeys = allKeys.filter((k) => isVaultEncryptedKey(k.key));

    const decryptedVaultKeys = await Promise.all(
      vaultKeys.map(async (k) => {
        const decrypted = await decryptApiKeyWithVault(k.key, vaultKey);
        return { ...k, key: decrypted };
      })
    );

    const otherKeys = allKeys.filter((k) => !isVaultEncryptedKey(k.key));
    const decryptedOther = await Promise.all(
      otherKeys.map(async (k) => {
        try {
          const decrypted = await decryptApiKey(k.key);
          return { ...k, key: decrypted };
        } catch {
          return k;
        }
      })
    );

    const effectiveRememberMs = rememberMs ?? get().vault.rememberMs ?? DEFAULT_REMEMBER_MS;
    const newUnlockedUntil = Date.now() + effectiveRememberMs;
    scheduleVaultAutoLock(newUnlockedUntil, () => get().lockVault());
    await persistVaultSession(exportableVaultKey, newUnlockedUntil);

    set({
      keys: [...decryptedVaultKeys, ...decryptedOther],
      vault: {
        meta,
        passkey,
        isUnlocked: true,
        unlockedUntil: newUnlockedUntil,
        rememberMs: effectiveRememberMs,
      },
      vaultKeyIds: vaultKeys.map((k) => k.id),
      lockedKeyIds: [],
      vaultUnlockRequest: null,
    });
  },

  lockVault: () => {
    cachedVaultKey = null;
    clearVaultSession();
    if (vaultAutoLockTimeout) {
      clearTimeout(vaultAutoLockTimeout);
      vaultAutoLockTimeout = null;
    }

    const vaultKeyIds = get().vaultKeyIds;
    set({
      keys: get().keys.map((k) => (vaultKeyIds.includes(k.id) ? { ...k, key: "" } : k)),
      vault: { ...get().vault, isUnlocked: false, unlockedUntil: null },
      lockedKeyIds: [...vaultKeyIds],
    });
  },

  enableVault: async (passphrase: string, rememberMs?: number) => {
    const meta = createApiKeyVaultMeta();
    clearVaultSession();
    const verifyKey = await deriveVaultKey(passphrase, meta, { extractable: true });
    const verificationHash = await createVaultVerificationHash(verifyKey);
    const hydratedMeta = { ...meta, verificationHash };
    const vaultKey = await deriveVaultKey(passphrase, hydratedMeta);
    cachedVaultKey = vaultKey;

    const allKeys: ApiKey[] = await getAllApiKeys();

    // Re-encrypt all existing keys into the vault.
    await Promise.all(
      allKeys.map(async (k) => {
        if (isVaultEncryptedKey(k.key)) return;

        let plaintext = k.key;
        if (isEncryptedKey(k.key)) {
          plaintext = await decryptApiKey(k.key);
        }

        const encrypted = await encryptApiKeyWithVault(plaintext, vaultKey);
        await dbUpdateApiKey(k.id, { key: encrypted });
      })
    );

    await updateSettings({
      apiKeyVault: hydratedMeta,
      apiKeyVaultRememberMs: rememberMs ?? get().vault.rememberMs,
      apiKeyVaultPasskey: undefined,
    });

    const refreshed: ApiKey[] = await getAllApiKeys();
    const vaultKeys = refreshed.filter((k) => isVaultEncryptedKey(k.key));
    const otherKeys = refreshed.filter((k) => !isVaultEncryptedKey(k.key));

    const decryptedVaultKeys = await Promise.all(
      vaultKeys.map(async (k) => {
        const decrypted = await decryptApiKeyWithVault(k.key, vaultKey);
        return { ...k, key: decrypted };
      })
    );

    const decryptedOther = await Promise.all(
      otherKeys.map(async (k) => {
        try {
          const decrypted = await decryptApiKey(k.key);
          return { ...k, key: decrypted };
        } catch {
          return k;
        }
      })
    );

    const effectiveRememberMs = rememberMs ?? get().vault.rememberMs ?? DEFAULT_REMEMBER_MS;
    const newUnlockedUntil = Date.now() + effectiveRememberMs;
    scheduleVaultAutoLock(newUnlockedUntil, () => get().lockVault());
    await persistVaultSession(verifyKey, newUnlockedUntil);

    set({
      keys: [...decryptedVaultKeys, ...decryptedOther],
      vault: {
        meta: hydratedMeta,
        passkey: null,
        isUnlocked: true,
        unlockedUntil: newUnlockedUntil,
        rememberMs: effectiveRememberMs,
      },
      vaultKeyIds: vaultKeys.map((k) => k.id),
      lockedKeyIds: [],
    });

    toast.success("Vault enabled");
  },

  disableVault: async (passphrase: string) => {
    const settings = await getSettings();
    const meta = normalizeVaultMeta(settings.apiKeyVault ?? null);
    if (!meta) {
      cachedVaultKey = null;
      clearVaultSession();
      set({ vault: { ...get().vault, meta: null, passkey: null, isUnlocked: false, unlockedUntil: null } });
      return;
    }

    const vaultKey = await deriveVaultKey(passphrase, meta);

    const allKeys: ApiKey[] = await getAllApiKeys();
    const vaultKeys = allKeys.filter((k) => isVaultEncryptedKey(k.key));

    await Promise.all(
      vaultKeys.map(async (k) => {
        const plaintext = await decryptApiKeyWithVault(k.key, vaultKey);
        const encrypted = await encryptApiKey(plaintext);
        await dbUpdateApiKey(k.id, { key: encrypted });
      })
    );

    await updateSettings({
      apiKeyVault: undefined,
      apiKeyVaultRememberMs: undefined,
      apiKeyVaultPasskey: undefined,
    });

    cachedVaultKey = null;
    clearVaultSession();
    if (vaultAutoLockTimeout) {
      clearTimeout(vaultAutoLockTimeout);
      vaultAutoLockTimeout = null;
    }

    const refreshed: ApiKey[] = await getAllApiKeys();
    const decryptedAll: ApiKey[] = [];
    for (const k of refreshed) {
      try {
        const decrypted = await decryptApiKey(k.key);
        decryptedAll.push({ ...k, key: decrypted });
      } catch {
        decryptedAll.push(k);
      }
    }

    set({
      keys: decryptedAll,
      vault: {
        meta: null,
        passkey: null,
        isUnlocked: false,
        unlockedUntil: null,
        rememberMs: get().vault.rememberMs,
      },
      vaultKeyIds: [],
      lockedKeyIds: [],
    });

    toast.success("Vault disabled");
  },

  setupVaultPasskey: async (passphrase?: string) => {
    const settings = await getSettings();
    const meta = normalizeVaultMeta(settings.apiKeyVault ?? null);
    if (!meta) {
      throw new Error("Vault is not enabled");
    }

    let rawVaultKey: ArrayBuffer | null = null;
    if (cachedVaultKey) {
      try {
        rawVaultKey = await crypto.subtle.exportKey("raw", cachedVaultKey);
      } catch {
        rawVaultKey = null;
      }
    }

    if (!rawVaultKey) {
      if (!passphrase) {
        throw new Error("Enter your passphrase to set up a passkey");
      }
      const derived = await deriveVaultKey(passphrase, meta, { extractable: true });
      rawVaultKey = await crypto.subtle.exportKey("raw", derived);
    }

    const passkey = await createVaultPasskey(rawVaultKey);
    await updateSettings({ apiKeyVaultPasskey: passkey });
    set({ vault: { ...get().vault, passkey } });
  },

  removeVaultPasskey: async () => {
    await updateSettings({ apiKeyVaultPasskey: undefined });
    set({ vault: { ...get().vault, passkey: null } });
  },

  resetVault: async () => {
    const allKeys: ApiKey[] = await getAllApiKeys();
    const vaultKeys = allKeys.filter((k) => isVaultEncryptedKey(k.key));

    await Promise.all(vaultKeys.map((k) => dbDeleteApiKey(k.id)));
    await updateSettings({
      apiKeyVault: undefined,
      apiKeyVaultRememberMs: undefined,
      apiKeyVaultPasskey: undefined,
    });

    cachedVaultKey = null;
    clearVaultSession();
    if (vaultAutoLockTimeout) {
      clearTimeout(vaultAutoLockTimeout);
      vaultAutoLockTimeout = null;
    }

    const refreshed: ApiKey[] = await getAllApiKeys();
    const decryptedAll: ApiKey[] = [];
    for (const k of refreshed) {
      try {
        const decrypted = await decryptApiKey(k.key);
        decryptedAll.push({ ...k, key: decrypted });
      } catch {
        decryptedAll.push(k);
      }
    }

    set({
      keys: decryptedAll,
      vault: {
        meta: null,
        passkey: null,
        isUnlocked: false,
        unlockedUntil: null,
        rememberMs: get().vault.rememberMs,
      },
      vaultKeyIds: [],
      lockedKeyIds: [],
    });

    toast.success("Vault reset. Removed locked keys.");
  },

  // S3 Sync Config Methods - stored as special "sync-s3" provider
  getS3Config: () => {
    const state = get();
    const s3Key = state.keys.find((k) => k.provider === SYNC_S3_PROVIDER);
    if (!s3Key || !s3Key.key) return null;

    // Check if it's locked (vault key but vault is locked)
    if (state.lockedKeyIds.includes(s3Key.id)) return null;

    try {
      return JSON.parse(s3Key.key) as S3SyncConfig;
    } catch {
      return null;
    }
  },

  setS3Config: async (config: S3SyncConfig) => {
    const { vault, keys } = get();

    // If vault is configured, require it to be unlocked
    if (vault.meta && !vault.isUnlocked) {
      throw new Error("Vault is locked. Unlock it to save S3 credentials.");
    }

    const jsonPayload = JSON.stringify(config);
    const existingS3Key = keys.find((k) => k.provider === SYNC_S3_PROVIDER);

    if (existingS3Key) {
      // Update existing
      let encryptedPayload: string;
      if (vault.meta && cachedVaultKey) {
        encryptedPayload = await encryptApiKeyWithVault(jsonPayload, cachedVaultKey);
      } else {
        encryptedPayload = await encryptApiKey(jsonPayload);
      }
      await dbUpdateApiKey(existingS3Key.id, { key: encryptedPayload });
      // Update in-memory state
      set({
        keys: get().keys.map((k) =>
          k.id === existingS3Key.id ? { ...k, key: jsonPayload } : k
        ),
      });
    } else {
      // Create new
      let encryptedPayload: string;
      if (vault.meta && cachedVaultKey) {
        encryptedPayload = await encryptApiKeyWithVault(jsonPayload, cachedVaultKey);
      } else {
        encryptedPayload = await encryptApiKey(jsonPayload);
      }
      const newKey = await dbAddApiKey({
        provider: SYNC_S3_PROVIDER,
        key: encryptedPayload,
        label: "S3 Sync",
      });
      const newVaultKeyIds = vault.meta ? [...get().vaultKeyIds, newKey.id] : get().vaultKeyIds;
      set({
        keys: [...get().keys, { ...newKey, key: jsonPayload }],
        vaultKeyIds: newVaultKeyIds,
      });
    }
  },

  removeS3Config: async () => {
    const { keys } = get();
    const s3Key = keys.find((k) => k.provider === SYNC_S3_PROVIDER);
    if (!s3Key) return;

    await dbDeleteApiKey(s3Key.id);
    set({
      keys: get().keys.filter((k) => k.id !== s3Key.id),
      vaultKeyIds: get().vaultKeyIds.filter((id) => id !== s3Key.id),
      lockedKeyIds: get().lockedKeyIds.filter((id) => id !== s3Key.id),
    });
  },

  isS3ConfigLocked: () => {
    const state = get();
    const s3Key = state.keys.find((k) => k.provider === SYNC_S3_PROVIDER);
    if (!s3Key) return false;
    return state.lockedKeyIds.includes(s3Key.id);
  },

  isS3ConfigAvailable: () => {
    const state = get();
    return state.keys.some((k) => k.provider === SYNC_S3_PROVIDER);
  },
}));
