import { create } from "zustand";
import { MODELS, type Model, setDynamicModels } from "@/lib/constants/models";

type ModelsPayload = { fetchedAt: number; models: Model[] };

const LS_KEY = "lumina:models-cache:v1";
const CACHE_TTL_MS = 60 * 60_000; // 1 hour

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

interface ModelsState {
  isLoaded: boolean;
  isLoading: boolean;
  error?: string;
  models: Model[];
  fetchedAt?: number;

  loadModels: (opts?: { refresh?: boolean }) => Promise<void>;
}

export const useModelsStore = create<ModelsState>((set, get) => ({
  isLoaded: false,
  isLoading: false,
  models: MODELS,

  loadModels: async (opts) => {
    const refresh = !!opts?.refresh;
    if (get().isLoading) return;

    set({ isLoading: true, error: undefined });

    try {
      if (!refresh) {
        const cached = readCache();
        if (cached && cached.models.length > 0) {
          set({
            models: cached.models,
            fetchedAt: cached.fetchedAt,
            isLoaded: true,
            isLoading: false,
          });
          setDynamicModels(cached.models);
          return;
        }
      }

      const url = refresh ? "/api/models?refresh=1" : "/api/models";
      const res = await fetch(url, { method: "GET" });
      if (!res.ok) throw new Error(`Failed to load models (${res.status})`);

      const payload = (await res.json()) as ModelsPayload;
      if (!payload || !Array.isArray(payload.models)) throw new Error("Invalid models payload");

      writeCache(payload);
      set({
        models: payload.models.length > 0 ? payload.models : MODELS,
        fetchedAt: payload.fetchedAt,
        isLoaded: true,
        isLoading: false,
      });
      setDynamicModels(payload.models);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to load models";
      set({ error: message, isLoaded: true, isLoading: false, models: MODELS });
      setDynamicModels(null);
    }
  },
}));

