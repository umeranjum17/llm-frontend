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
    const encryptedKeys = await getAllApiKeys();

    // Decrypt keys and migrate any plaintext keys to encrypted format
    const decryptedKeys: ApiKey[] = [];
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
        console.error(`[API Keys] Failed to process key for ${storedKey.provider}:`, error);
        // Include key as-is if decryption fails
        decryptedKeys.push(storedKey);
      }
    }

    set({ keys: decryptedKeys, isLoaded: true });
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
