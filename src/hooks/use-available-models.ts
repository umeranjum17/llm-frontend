/**
 * Centralized hook for getting available models with provider filtering.
 * Use this across all model selection UI components.
 */

import { useMemo } from "react";
import { useModelsStore } from "@/stores/models-store";
import { useApiKeysStore } from "@/stores/api-keys-store";
import { MODELS, type Model, ALL_STATIC_MODELS } from "@/lib/constants/models";
import { isModelIdCompatibleWithProviderId } from "@/lib/ai/provider-routing";
import { PROVIDERS, isCustomOpenAIProvider, resolveProvider } from "@/lib/providers";
import { providerLabel } from "@/lib/ai/provider-routing";

// Provider IDs that are LLM providers (not MCP or other services)
const LLM_PROVIDER_IDS = [
  "openrouter", "openai", "anthropic", "google", "deepseek",
  "mistral", "xai", "groq", "together", "perplexity", "anyscale"
];

export interface ProviderOption {
  id: string;
  name: string;
}

export interface UseAvailableModelsOptions {
  /** If set, filter models to only those compatible with this provider */
  providerId?: string;
  /** Include legacy models in the list */
  includeLegacy?: boolean;
  /** Filter by model category */
  category?: "all" | "chat" | "image" | "vision" | "reasoning" | "coding" | "cheap";
  /** Only include models under this total cost (input + output per 1M) */
  maxCost?: number;
}

export interface UseAvailableModelsResult {
  /** All models (filtered by options) */
  models: Model[];
  /** Available LLM providers (those with API keys) */
  providers: ProviderOption[];
  /** Provider IDs that have API keys configured */
  providerIds: string[];
  /** Whether OpenRouter is available (can use any model) */
  hasOpenRouter: boolean;
  /** Get models filtered by provider */
  getModelsForProvider: (providerId: string) => Model[];
  /** Check if a provider can serve a model */
  canProviderServeModel: (providerId: string, modelId: string) => boolean;
  /** Loading state */
  isLoading: boolean;
}

/**
 * Hook for getting available models with provider awareness.
 *
 * Usage:
 * ```tsx
 * const { models, providers, hasOpenRouter } = useAvailableModels();
 * const { models: cheapModels } = useAvailableModels({ maxCost: 2 });
 * const { models: googleModels } = useAvailableModels({ providerId: "google" });
 * ```
 */
export function useAvailableModels(options: UseAvailableModelsOptions = {}): UseAvailableModelsResult {
  const { providerId, includeLegacy = false, category = "all", maxCost } = options;

  const { models: storeModels, isLoading } = useModelsStore();
  const { keys } = useApiKeysStore();

  // Get provider IDs that have API keys
  const providerIds = useMemo(() => {
    return Array.from(
      new Set(
        keys
          .map((k) => k.provider)
          .filter((p) =>
            LLM_PROVIDER_IDS.includes(p) || p.startsWith("custom-openai:")
          )
      )
    );
  }, [keys]);

  // Get provider options with names
  const providers = useMemo((): ProviderOption[] => {
    const options: ProviderOption[] = [];

    for (const id of providerIds) {
      const key = keys.find(k => k.provider === id);
      const name = key?.label || providerLabel(id);
      options.push({ id, name });
    }

    // Sort with OpenRouter first
    return options.sort((a, b) => {
      if (a.id === "openrouter") return -1;
      if (b.id === "openrouter") return 1;
      return a.name.localeCompare(b.name);
    });
  }, [providerIds, keys]);

  const hasOpenRouter = providerIds.includes("openrouter");

  // Base models (from store or static)
  const baseModels = useMemo(() => {
    if (storeModels.length > 0) return storeModels;
    return includeLegacy ? ALL_STATIC_MODELS : MODELS;
  }, [storeModels, includeLegacy]);

  // Filter models by all criteria
  const models = useMemo(() => {
    let filtered = baseModels;

    // Filter by provider compatibility
    if (providerId && providerId !== "auto" && providerId !== "openrouter") {
      filtered = filtered.filter(m => isModelIdCompatibleWithProviderId(providerId, m.id));
    }

    // Filter by category
    if (category !== "all") {
      filtered = filtered.filter(m => {
        switch (category) {
          case "image":
            return m.category.includes("image-generation");
          case "vision":
            return m.supportsVision && !m.category.includes("image-generation");
          case "reasoning":
            return m.supportsReasoning;
          case "coding":
            return m.category.includes("coding");
          case "cheap":
            return m.tier === "budget" || (m.inputCost + m.outputCost) < 2;
          case "chat":
            return !m.category.includes("image-generation");
          default:
            return true;
        }
      });
    }

    // Filter by max cost
    if (maxCost !== undefined) {
      filtered = filtered.filter(m => (m.inputCost + m.outputCost) <= maxCost);
    }

    return filtered;
  }, [baseModels, providerId, category, maxCost]);

  // Helper to get models for a specific provider
  const getModelsForProvider = useMemo(() => {
    return (pid: string): Model[] => {
      if (pid === "openrouter" || pid === "auto") return baseModels;
      return baseModels.filter(m => isModelIdCompatibleWithProviderId(pid, m.id));
    };
  }, [baseModels]);

  // Helper to check if a provider can serve a model
  const canProviderServeModel = useMemo(() => {
    return (pid: string, modelId: string): boolean => {
      if (pid === "openrouter") return true;
      return isModelIdCompatibleWithProviderId(pid, modelId);
    };
  }, []);

  return {
    models,
    providers,
    providerIds,
    hasOpenRouter,
    getModelsForProvider,
    canProviderServeModel,
    isLoading,
  };
}

/**
 * Get cheap models suitable for background tasks.
 * Sorted by cost (cheapest first).
 */
export function useCheapModels() {
  const result = useAvailableModels({ maxCost: 5, includeLegacy: true });

  const sortedModels = useMemo(() => {
    return [...result.models].sort((a, b) =>
      (a.inputCost + a.outputCost) - (b.inputCost + b.outputCost)
    );
  }, [result.models]);

  return { ...result, models: sortedModels };
}

/**
 * Get recommended models for a specific use case.
 */
export function useRecommendedModels(useCase: "coding" | "reasoning" | "chat" | "budget" | "agents") {
  const result = useAvailableModels();

  const models = useMemo(() => {
    switch (useCase) {
      case "coding":
        return result.models.filter(m =>
          m.category.includes("coding") || m.tier === "flagship"
        ).slice(0, 5);
      case "reasoning":
        return result.models.filter(m => m.supportsReasoning).slice(0, 5);
      case "chat":
        return result.models.filter(m =>
          m.tier === "balanced" || m.tier === "fast"
        ).slice(0, 5);
      case "budget":
        return [...result.models]
          .sort((a, b) => (a.inputCost + a.outputCost) - (b.inputCost + b.outputCost))
          .slice(0, 5);
      case "agents":
        return result.models.filter(m =>
          m.category.includes("agents") || m.tier === "flagship"
        ).slice(0, 5);
      default:
        return result.models.slice(0, 5);
    }
  }, [result.models, useCase]);

  return { ...result, models };
}
