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
        const failedDecryptionKeys: string[] = [];

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
            const errorObj = error as Error;
            const errorMessage = errorObj?.message || "Unknown error";

            // If it's an encrypted key and decryption failed, mark as unusable
            if (isEncryptedKey(storedKey.key)) {
              console.warn(
                `[API Keys] Decryption failed for ${storedKey.provider}:`,
                errorMessage
              );
              failedDecryptionKeys.push(storedKey.provider);
              // Don't include unusable keys - they need to be re-entered
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

        // Show toast if any keys failed decryption
        if (failedDecryptionKeys.length > 0) {
          toast.error("API Keys Need Re-entry", {
            description: `The following API keys could not be decrypted (likely due to device secret change): ${failedDecryptionKeys.join(", ")}. Please re-enter them in Settings.`,
            duration: 10000,
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
