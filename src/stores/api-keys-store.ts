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
import {
  encryptApiKey,
  decryptApiKey,
  isEncryptedKey,
  DecryptionError,
} from "@/lib/crypto/api-key-crypto";
import type { ApiKeyVaultMeta } from "@/lib/crypto/api-key-vault";
import {
  createApiKeyVaultMeta,
  decryptApiKeyWithVault,
  deriveVaultKey,
  encryptApiKeyWithVault,
  isVaultEncryptedKey,
} from "@/lib/crypto/api-key-vault";
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
}

let cachedVaultKey: CryptoKey | null = null;
let vaultAutoLockTimeout: ReturnType<typeof setTimeout> | null = null;

const VAULT_SESSION_STORAGE_KEY = "apiKeyVaultSession";
const VAULT_SESSION_VERSION = 1;

interface VaultSessionPayload {
  version: number;
  meta: ApiKeyVaultMeta;
  expiresAt: number;
  rawKey: string;
}

function canUseSessionStorage() {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
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

function isSameVaultMeta(left: ApiKeyVaultMeta, right: ApiKeyVaultMeta): boolean {
  return (
    left.version === right.version &&
    left.kdf === right.kdf &&
    left.iterations === right.iterations &&
    left.salt === right.salt
  );
}

function clearVaultSession() {
  if (!canUseSessionStorage()) return;
  try {
    window.sessionStorage.removeItem(VAULT_SESSION_STORAGE_KEY);
  } catch {
    // Ignore storage errors.
  }
}

function readVaultSession(): VaultSessionPayload | null {
  if (!canUseSessionStorage()) return null;
  try {
    const stored = window.sessionStorage.getItem(VAULT_SESSION_STORAGE_KEY);
    if (!stored) return null;

    const parsed = JSON.parse(stored) as VaultSessionPayload;
    if (
      !parsed ||
      parsed.version !== VAULT_SESSION_VERSION ||
      typeof parsed.expiresAt !== "number" ||
      typeof parsed.rawKey !== "string" ||
      !parsed.meta
    ) {
      clearVaultSession();
      return null;
    }
    return parsed;
  } catch {
    clearVaultSession();
    return null;
  }
}

async function persistVaultSession(
  vaultKey: CryptoKey,
  meta: ApiKeyVaultMeta,
  expiresAt: number
) {
  if (!canUseSessionStorage()) return;
  try {
    const rawKey = await crypto.subtle.exportKey("raw", vaultKey);
    const payload: VaultSessionPayload = {
      version: VAULT_SESSION_VERSION,
      meta,
      expiresAt,
      rawKey: arrayBufferToBase64(rawKey),
    };
    window.sessionStorage.setItem(VAULT_SESSION_STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn("[API Keys] Failed to persist vault session:", error);
  }
}

async function restoreVaultSession(
  meta: ApiKeyVaultMeta
): Promise<{ key: CryptoKey; expiresAt: number } | null> {
  if (!canUseSessionStorage()) return null;

  const payload = readVaultSession();
  if (!payload) return null;
  if (!isSameVaultMeta(meta, payload.meta)) {
    clearVaultSession();
    return null;
  }
  if (payload.expiresAt <= Date.now()) {
    clearVaultSession();
    return null;
  }

  try {
    const rawKey = base64ToArrayBuffer(payload.rawKey);
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

function updateVaultSessionExpiry(meta: ApiKeyVaultMeta, expiresAt: number) {
  if (!canUseSessionStorage()) return;
  const payload = readVaultSession();
  if (!payload || !isSameVaultMeta(meta, payload.meta)) return;
  payload.expiresAt = expiresAt;
  try {
    window.sessionStorage.setItem(VAULT_SESSION_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage errors.
  }
}

function scheduleVaultAutoLock(lockAt: number, lock: () => void) {
  if (vaultAutoLockTimeout) clearTimeout(vaultAutoLockTimeout);
  const delay = Math.max(0, lockAt - Date.now());
  vaultAutoLockTimeout = setTimeout(lock, delay);
}

export const useApiKeysStore = create<ApiKeysState>((set, get) => ({
  keys: [],
  isLoaded: false,
  vault: {
    meta: null,
    passkey: null,
    isUnlocked: false,
    unlockedUntil: null,
    rememberMs: 24 * 60 * 60 * 1000,
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
          getAllApiKeys(),
        ]);

        const vaultMeta = settings.apiKeyVault ?? null;
        const vaultPasskey = vaultMeta ? settings.apiKeyVaultPasskey ?? null : null;
        const rememberMs = settings.apiKeyVaultRememberMs ?? get().vault.rememberMs;

        if (!vaultMeta) {
          cachedVaultKey = null;
          clearVaultSession();
        }

        let restoredVault: { key: CryptoKey; expiresAt: number } | null = null;
        if (vaultMeta) {
          restoredVault = await restoreVaultSession(vaultMeta);
          if (restoredVault) {
            cachedVaultKey = restoredVault.key;
          }
        }

        const now = Date.now();
        const storedUnlockedUntil = get().vault.unlockedUntil;
        const sessionUnlockedUntil = restoredVault?.expiresAt ?? null;
        const isSessionUnlocked =
          typeof sessionUnlockedUntil === "number" && sessionUnlockedUntil > now;
        const isStoredUnlocked =
          !!vaultMeta &&
          get().vault.isUnlocked &&
          !!cachedVaultKey &&
          typeof storedUnlockedUntil === "number" &&
          storedUnlockedUntil > now;
        const isVaultUnlocked = !!vaultMeta && (isSessionUnlocked || isStoredUnlocked);
        const unlockedUntil = isSessionUnlocked
          ? sessionUnlockedUntil
          : isStoredUnlocked
            ? storedUnlockedUntil
            : null;

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
        const nonVaultKeys = encryptedKeys.filter((k) => !isVaultEncryptedKey(k.key));
        const vaultKeys = encryptedKeys.filter((k) => isVaultEncryptedKey(k.key));

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
          nonVaultKeys.map(async (storedKey) => {
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

        set({
          keys: orderedKeys,
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
    const { vault } = get();

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
      if (vaultState.meta) {
        updateVaultSessionExpiry(vaultState.meta, newUnlockedUntil);
      }
      return;
    }
    set({ vault: { ...vaultState, rememberMs } });
  },

  unlockVault: async (passphrase: string, rememberMs?: number) => {
    const settings = await getSettings();
    const meta = settings.apiKeyVault;
    if (!meta) {
      throw new Error("Vault is not enabled");
    }

    const vaultKey = await deriveVaultKey(passphrase, meta, { extractable: true });
    cachedVaultKey = vaultKey;

    const allKeys = await getAllApiKeys();
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

    const effectiveRememberMs =
      rememberMs ?? settings.apiKeyVaultRememberMs ?? get().vault.rememberMs;
    const newUnlockedUntil = Date.now() + effectiveRememberMs;
    scheduleVaultAutoLock(newUnlockedUntil, () => get().lockVault());
    if (effectiveRememberMs > 0) {
      await persistVaultSession(vaultKey, meta, newUnlockedUntil);
    } else {
      clearVaultSession();
    }

    set({
      keys: [...decryptedVaultKeys, ...decryptedOther],
      vault: {
        meta,
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
    const meta = settings.apiKeyVault;
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
      true,
      ["encrypt", "decrypt"]
    );
    cachedVaultKey = vaultKey;

    const allKeys = await getAllApiKeys();
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

    const effectiveRememberMs =
      rememberMs ?? settings.apiKeyVaultRememberMs ?? get().vault.rememberMs;
    const newUnlockedUntil = Date.now() + effectiveRememberMs;
    scheduleVaultAutoLock(newUnlockedUntil, () => get().lockVault());
    if (effectiveRememberMs > 0) {
      await persistVaultSession(vaultKey, meta, newUnlockedUntil);
    } else {
      clearVaultSession();
    }

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
    const vaultKey = await deriveVaultKey(passphrase, meta, { extractable: true });
    cachedVaultKey = vaultKey;

    const allKeys = await getAllApiKeys();

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
      apiKeyVault: meta,
      apiKeyVaultRememberMs: rememberMs ?? get().vault.rememberMs,
      apiKeyVaultPasskey: undefined,
    });

    const refreshed = await getAllApiKeys();
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

    const effectiveRememberMs = rememberMs ?? get().vault.rememberMs;
    const newUnlockedUntil = Date.now() + effectiveRememberMs;
    scheduleVaultAutoLock(newUnlockedUntil, () => get().lockVault());
    if (effectiveRememberMs > 0) {
      await persistVaultSession(vaultKey, meta, newUnlockedUntil);
    } else {
      clearVaultSession();
    }

    set({
      keys: [...decryptedVaultKeys, ...decryptedOther],
      vault: {
        meta,
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
    const meta = settings.apiKeyVault;
    if (!meta) {
      cachedVaultKey = null;
      clearVaultSession();
      set({ vault: { ...get().vault, meta: null, passkey: null, isUnlocked: false, unlockedUntil: null } });
      return;
    }

    const vaultKey = await deriveVaultKey(passphrase, meta);

    const allKeys = await getAllApiKeys();
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

    const refreshed = await getAllApiKeys();
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
    const meta = settings.apiKeyVault;
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
}));
