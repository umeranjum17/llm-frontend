import { create } from "zustand";
import {
  getAllApiKeys,
  getApiKeyByProvider,
  addApiKey as dbAddApiKey,
  deleteApiKey as dbDeleteApiKey,
} from "@/lib/db/queries";
import type { ApiKey } from "@/lib/db/schema";

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
    const keys = await getAllApiKeys();
    set({ keys, isLoaded: true });
  },

  getKeyForProvider: (provider) => {
    return get().keys.find((k) => k.provider === provider);
  },

  addKey: async (provider, key, label, baseUrl) => {
    const newKey = await dbAddApiKey({ provider, key, label, baseUrl });
    set({ keys: [...get().keys, newKey] });
  },

  removeKey: async (id) => {
    await dbDeleteApiKey(id);
    set({ keys: get().keys.filter((k) => k.id !== id) });
  },

  hasKey: (provider) => {
    return get().keys.some((k) => k.provider === provider);
  },
}));
