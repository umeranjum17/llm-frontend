import { create } from "zustand";
import {
  FEATURED_MODELS,
  ALL_STATIC_MODELS,
  DEFAULT_MODEL,
  getStaticModelById,
  CATALOG_VERSION,
} from "@/lib/models/static-models";
import type { Model } from "@/lib/constants/models";
import { setDynamicModels } from "@/lib/constants/models";

/**
 * Models Store
 *
 * Uses a static, curated model catalog by default (no API calls needed).
 * The "refresh" option can optionally merge in new models from the API.
 *
 * Benefits:
 * - Instant startup (no API latency)
 * - Curated, high-quality model list
 * - Users see the best models, not hundreds of outdated ones
 * - Full control over model metadata
 */

interface ModelsState {
  isLoaded: boolean;
  isLoading: boolean;
  error?: string;
  models: Model[];
  fetchedAt?: number;
  catalogVersion: string;

  loadModels: (opts?: { refresh?: boolean }) => Promise<{ success: boolean; count?: number; error?: string }>;
  clearModelsCache: () => void;
  getDefaultModel: () => Model;
}

export const useModelsStore = create<ModelsState>((set, get) => ({
  isLoaded: true, // Static models are always "loaded"
  isLoading: false,
  models: FEATURED_MODELS,
  fetchedAt: Date.now(),
  catalogVersion: CATALOG_VERSION,

  getDefaultModel: () => DEFAULT_MODEL,

  clearModelsCache: () => {
    // Reset to static models
    set({
      models: FEATURED_MODELS,
      fetchedAt: Date.now(),
      isLoaded: true,
      error: undefined,
    });
    setDynamicModels(FEATURED_MODELS);
  },

  loadModels: async (opts) => {
    const refresh = !!opts?.refresh;

    // If not refreshing, just return static models immediately
    if (!refresh) {
      const models = get().models;
      if (models.length > 0) {
        return { success: true, count: models.length };
      }

      // Initialize with static models
      set({
        models: FEATURED_MODELS,
        fetchedAt: Date.now(),
        isLoaded: true,
        isLoading: false,
      });
      setDynamicModels(FEATURED_MODELS);
      return { success: true, count: FEATURED_MODELS.length };
    }

    // Refresh: Optionally fetch from API to discover new models
    set({ isLoading: true, error: undefined });

    try {
      const url = `/api/models?refresh=1&_t=${Date.now()}`;
      const res = await fetch(url, {
        method: "GET",
        cache: "no-store",
      });

      if (!res.ok) {
        // API failed, but we still have static models
        console.warn("[ModelsStore] API fetch failed, using static models");
        set({ isLoading: false });
        return { success: true, count: FEATURED_MODELS.length };
      }

      const payload = await res.json();
      if (!payload || !Array.isArray(payload.models)) {
        set({ isLoading: false });
        return { success: true, count: FEATURED_MODELS.length };
      }


      // Merge: Static models take priority, but add any new models from API
      const staticIds = new Set(ALL_STATIC_MODELS.map(m => m.id));
      const newFromApi = (payload.models as Model[]).filter(m => !staticIds.has(m.id));

      if (newFromApi.length > 0) {
      }

      // Combine: Featured first, then any new from API
      const mergedModels = [...FEATURED_MODELS, ...newFromApi];

      set({
        models: mergedModels,
        fetchedAt: Date.now(),
        isLoaded: true,
        isLoading: false,
        error: undefined,
      });
      setDynamicModels(mergedModels);

      return { success: true, count: mergedModels.length };
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to refresh models";
      console.warn("[ModelsStore] Refresh failed:", message);

      // Still return success since we have static models
      set({ error: message, isLoading: false });
      return { success: true, count: FEATURED_MODELS.length };
    }
  },
}));

// Export convenience functions
export function getModelById(modelId: string): Model | undefined {
  return getStaticModelById(modelId);
}

export { DEFAULT_MODEL };
