/**
 * Static Model Catalog
 *
 * This module provides a curated, static list of models instead of fetching
 * from dynamic APIs. This gives us more control over:
 * - Which models are shown to users
 * - Model metadata (descriptions, pricing, capabilities)
 * - Organizing featured vs legacy models
 * - Provider routing
 *
 * Updated: January 2026
 */

import featuredData from "./data/featured.json";
import legacyData from "./data/legacy.json";
import providersData from "./data/providers.json";
import type { Model } from "@/lib/constants/models";

// Type for raw model data from JSON
interface RawModel {
  id: string;
  name: string;
  provider: string;
  description?: string;
  contextLength: number;
  inputCost: number;
  outputCost: number;
  category: string[];
  tier?: "flagship" | "balanced" | "fast" | "budget";
  supportsReasoning?: boolean;
  supportsVision?: boolean;
  supportsThinking?: boolean;
  supportsPromptCaching?: boolean;
  releaseDate?: string;
  recommendedFor?: string[];
  isDefault?: boolean;
  legacy?: boolean;
  legacyReason?: string;
}

// Convert raw JSON to Model type
function toModel(raw: RawModel): Model {
  return {
    id: raw.id,
    name: raw.name,
    provider: raw.provider,
    description: raw.description,
    contextLength: raw.contextLength,
    inputCost: raw.inputCost,
    outputCost: raw.outputCost,
    category: raw.category,
    tier: raw.tier,
    supportsReasoning: raw.supportsReasoning,
    supportsVision: raw.supportsVision,
    supportsThinking: raw.supportsThinking,
    supportsPromptCaching: raw.supportsPromptCaching,
    releaseDate: raw.releaseDate,
    recommendedFor: raw.recommendedFor,
  };
}

// Featured models (shown by default)
export const FEATURED_MODELS: Model[] = (featuredData.models as RawModel[]).map(toModel);

// Legacy models (hidden by default, available for backwards compat)
export const LEGACY_MODELS: Model[] = (legacyData.models as RawModel[]).map(toModel);

// All models combined
export const ALL_STATIC_MODELS: Model[] = [...FEATURED_MODELS, ...LEGACY_MODELS];

// Default model (best for general conversation)
export const DEFAULT_MODEL: Model = FEATURED_MODELS.find(
  (m) => (featuredData.models as RawModel[]).find(raw => raw.id === m.id)?.isDefault
) || FEATURED_MODELS[0];

// Provider data
export const PROVIDERS = providersData.providers as Record<string, {
  name: string;
  description: string;
  supportsAllModels?: boolean;
  models?: string[];
  website: string;
}>;

export const DEFAULT_PROVIDER = providersData.defaultProvider;
export const PROVIDER_PRIORITY = providersData.providerPriority;

/**
 * Get models for a specific provider
 */
export function getModelsForProvider(providerId: string): Model[] {
  const provider = PROVIDERS[providerId];
  if (!provider) return [];

  // OpenRouter supports all models
  if (provider.supportsAllModels) {
    return ALL_STATIC_MODELS;
  }

  // Filter to models this provider supports
  const supportedIds = new Set(provider.models || []);
  return ALL_STATIC_MODELS.filter(m => supportedIds.has(m.id));
}

/**
 * Check if a provider supports a specific model
 */
export function providerSupportsModel(providerId: string, modelId: string): boolean {
  const provider = PROVIDERS[providerId];
  if (!provider) return false;

  if (provider.supportsAllModels) return true;

  return provider.models?.includes(modelId) || false;
}

/**
 * Get the best provider for a model based on priority
 */
export function getBestProviderForModel(modelId: string, availableProviders: string[]): string | null {
  // Check providers in priority order
  for (const providerId of PROVIDER_PRIORITY) {
    if (!availableProviders.includes(providerId)) continue;

    if (providerSupportsModel(providerId, modelId)) {
      return providerId;
    }
  }

  // Fallback to openrouter if available (supports all models)
  if (availableProviders.includes("openrouter")) {
    return "openrouter";
  }

  return null;
}

/**
 * Get featured models by category
 */
export function getFeaturedByCategory(category: string): Model[] {
  if (category === "all") return FEATURED_MODELS;

  return FEATURED_MODELS.filter(m => {
    if (category === "reasoning" && m.supportsReasoning) return true;
    if (category === "vision" && m.supportsVision) return true;
    return m.category.includes(category);
  });
}

/**
 * Get featured models by tier
 */
export function getFeaturedByTier(tier: Model["tier"]): Model[] {
  return FEATURED_MODELS.filter(m => m.tier === tier);
}

/**
 * Get model by ID (checks featured first, then legacy)
 */
export function getStaticModelById(modelId: string): Model | undefined {
  return FEATURED_MODELS.find(m => m.id === modelId)
    || LEGACY_MODELS.find(m => m.id === modelId);
}

/**
 * Search models by query
 */
export function searchStaticModels(query: string, includeLegacy = false): Model[] {
  const models = includeLegacy ? ALL_STATIC_MODELS : FEATURED_MODELS;
  const q = query.toLowerCase();

  return models.filter(m => {
    const searchable = `${m.name} ${m.id} ${m.provider} ${m.description || ""}`.toLowerCase();
    return searchable.includes(q);
  });
}

// Use case recommendations (from featured models only)
export const USE_CASE_RECOMMENDATIONS: Record<string, { models: string[]; description: string }> = {
  coding: {
    models: ["anthropic/claude-sonnet-4.5", "openai/gpt-5.2", "anthropic/claude-opus-4.5", "google/gemini-3-flash-preview"],
    description: "Best for writing, debugging, and reviewing code",
  },
  reasoning: {
    models: ["openai/gpt-5.2-pro", "google/gemini-3-deep-think", "anthropic/claude-opus-4.5", "openai/gpt-5.2"],
    description: "Complex problem-solving and multi-step reasoning",
  },
  chat: {
    models: ["google/gemini-3-flash-preview", "openai/gpt-5", "anthropic/claude-haiku-4", "deepseek/deepseek-v3.2"],
    description: "Fast, natural conversation",
  },
  budget: {
    models: ["deepseek/deepseek-v3.2", "deepseek/deepseek-reasoner", "meta-llama/llama-4-scout", "google/gemini-3-flash-preview"],
    description: "Maximum value for cost-sensitive applications",
  },
  creative: {
    models: ["openai/gpt-5", "anthropic/claude-sonnet-4", "google/gemini-3-pro", "openai/gpt-5-image"],
    description: "Creative writing, brainstorming, and ideation",
  },
  research: {
    models: ["perplexity/sonar-pro", "openai/gpt-5.2", "google/gemini-3-pro", "anthropic/claude-opus-4.5"],
    description: "Research, analysis, and information synthesis",
  },
  vision: {
    models: ["openai/gpt-5.2", "google/gemini-3-pro", "anthropic/claude-opus-4.5", "meta-llama/llama-4-maverick"],
    description: "Image understanding and analysis",
  },
  agents: {
    models: ["anthropic/claude-sonnet-4.5", "anthropic/claude-opus-4.5", "openai/gpt-5.2", "google/gemini-3-flash-preview"],
    description: "Best for autonomous agent workflows",
  },
  "long-context": {
    models: ["meta-llama/llama-4-scout", "google/gemini-3-pro", "google/gemini-3-flash-preview", "openai/gpt-5.2"],
    description: "Processing very long documents or codebases",
  },
  "image-generation": {
    models: ["openai/gpt-5-image", "openai/dall-e-3"],
    description: "Generate images from text prompts",
  },
};

/**
 * Get recommended models for a use case
 */
export function getRecommendedModels(useCase: string): Model[] {
  const rec = USE_CASE_RECOMMENDATIONS[useCase];
  if (!rec) return [];

  return rec.models
    .map(id => getStaticModelById(id))
    .filter((m): m is Model => m !== undefined);
}

// Export metadata
export const CATALOG_VERSION = "2026-01-15";
export const FEATURED_COUNT = FEATURED_MODELS.length;
export const LEGACY_COUNT = LEGACY_MODELS.length;
