import { create } from "zustand";
import { MODELS, type Model, setDynamicModels } from "@/lib/constants/models";

type ModelsPayload = { fetchedAt: number; models: Model[] };

const LS_KEY = "lumina:models-cache:v1";
const CACHE_TTL_MS = 60 * 60_000; // 1 hour

// Get hardcoded image generation models that should always be included
function getImageGenModels(): Model[] {
  return MODELS.filter(m => m.category.includes("image-generation"));
}

// Merge image generation models into any model list
function mergeWithImageModels(models: Model[]): Model[] {
  const imageModels = getImageGenModels();
  const existingIds = new Set(models.map(m => m.id));
  const missingImageModels = imageModels.filter(m => !existingIds.has(m.id));
  return [...models, ...missingImageModels];
}

function readCache(): ModelsPayload | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ModelsPayload;
    if (!parsed || !Array.isArray(parsed.models) || typeof parsed.fetchedAt !== "number") {
      return null;
    }
    if (Date.now() - parsed.fetchedAt > CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(payload: ModelsPayload) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

function clearCache() {
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    // ignore
  }
}

interface ModelsState {
  isLoaded: boolean;
  isLoading: boolean;
  error?: string;
  models: Model[];
  fetchedAt?: number;

  loadModels: (opts?: { refresh?: boolean }) => Promise<{ success: boolean; count?: number; error?: string }>;
  clearModelsCache: () => void;
}

export const useModelsStore = create<ModelsState>((set, get) => ({
  isLoaded: false,
  isLoading: false,
  models: MODELS,

  clearModelsCache: () => {
    clearCache();
  },

  loadModels: async (opts) => {
    const refresh = !!opts?.refresh;

    // If already loading and not a refresh request, skip
    if (get().isLoading && !refresh) {
      return { success: true, count: get().models.length };
    }

    // For refresh, clear the cache first
    if (refresh) {
      clearCache();
    }

    set({ isLoading: true, error: undefined });

    try {
      if (!refresh) {
        const cached = readCache();
        if (cached && cached.models.length > 0) {
          const mergedModels = mergeWithImageModels(cached.models);
          set({
            models: mergedModels,
            fetchedAt: cached.fetchedAt,
            isLoaded: true,
            isLoading: false,
          });
          setDynamicModels(mergedModels);
          return { success: true, count: mergedModels.length };
        }
      }

      // Add cache-busting for refresh requests
      const url = refresh
        ? `/api/models?refresh=1&_t=${Date.now()}`
        : "/api/models";
      const res = await fetch(url, {
        method: "GET",
        cache: refresh ? "no-store" : "default",
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => "Unknown error");
        throw new Error(`Failed to load models (${res.status}): ${errorText}`);
      }

      const payload = (await res.json()) as ModelsPayload;
      if (!payload || !Array.isArray(payload.models)) {
        throw new Error("Invalid models payload");
      }

      console.log("[ModelsStore] Received models from API:", payload.models.length);
      const imageGenCount = payload.models.filter(m => m.category?.includes("image-generation")).length;
      console.log("[ModelsStore] Image generation models from API:", imageGenCount);

      writeCache(payload);
      const mergedModels = payload.models.length > 0
        ? mergeWithImageModels(payload.models)
        : MODELS;

      console.log("[ModelsStore] After merge, total models:", mergedModels.length);

      set({
        models: mergedModels,
        fetchedAt: payload.fetchedAt,
        isLoaded: true,
        isLoading: false,
        error: undefined,
      });
      setDynamicModels(mergedModels);
      return { success: true, count: mergedModels.length };
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to load models";
      set({ error: message, isLoaded: true, isLoading: false, models: MODELS });
      setDynamicModels(null);
      return { success: false, error: message };
    }
  },
}));
