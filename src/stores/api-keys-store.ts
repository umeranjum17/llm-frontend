import { create } from "zustand";
import {
  getAllApiKeys,
  getApiKeyByProvider,
  addApiKey as dbAddApiKey,
  deleteApiKey as dbDeleteApiKey,
  updateApiKey as dbUpdateApiKey,
} from "@/lib/db/queries";
import type { ApiKey } from "@/lib/db/schema";
import {
  encryptApiKey,
  decryptApiKey,
  isEncryptedKey,
  DecryptionError,
} from "@/lib/crypto/api-key-crypto";
import { toast } from "sonner";

interface ApiKeysState {
  keys: ApiKey[];
  isLoaded: boolean;

  // Actions
  loadKeys: () => Promise<void>;
  getKeyForProvider: (provider: string) => ApiKey | undefined;
  addKey: (provider: string, key: string, label?: string, baseUrl?: string) => Promise<void>;
  removeKey: (id: string) => Promise<void>;
  hasKey: (provider: string) => boolean;
}

export const useApiKeysStore = create<ApiKeysState>((set, get) => ({
  keys: [],
  isLoaded: false,

  loadKeys: async () => {
    const maxRetries = 3;
    let retryCount = 0;
    
    const attemptLoad = async (): Promise<void> => {
      try {
        const encryptedKeys = await getAllApiKeys();

        // Decrypt keys and migrate any plaintext keys to encrypted format
        const decryptedKeys: ApiKey[] = [];
        const failedDecryptionKeys: { provider: string; code: string; message: string }[] = [];

        const keysToDelete: string[] = [];

        for (const storedKey of encryptedKeys) {
          try {
            const decryptedKeyValue = await decryptApiKey(storedKey.key);

            // Migrate plaintext keys to encrypted format
            if (!isEncryptedKey(storedKey.key)) {
              const encryptedValue = await encryptApiKey(decryptedKeyValue);
              await dbUpdateApiKey(storedKey.id, { key: encryptedValue });
            }

            decryptedKeys.push({
              ...storedKey,
              key: decryptedKeyValue, // Store decrypted value in memory
            });
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
              failedDecryptionKeys.push({
                provider: storedKey.provider,
                code: errorCode,
                message: errorMessage,
              });
              keysToDelete.push(storedKey.id);
              continue;
            }

            // For plaintext keys, include as-is (graceful degradation)
            // But log the error for debugging
            console.warn(
              `[API Keys] Error processing plaintext key for ${storedKey.provider}:`,
              errorMessage
            );
            decryptedKeys.push(storedKey);
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

        set({ keys: decryptedKeys, isLoaded: true });
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
          // Retry with exponential backoff
          retryCount++;
          const backoffMs = Math.min(1000 * Math.pow(2, retryCount - 1), 3000);
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

  addKey: async (provider, key, label, baseUrl) => {
    // Encrypt the key before storing
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
    set({ keys: get().keys.filter((k) => k.id !== id) });
  },

  hasKey: (provider) => {
    return get().keys.some((k) => k.provider === provider);
  },
}));
