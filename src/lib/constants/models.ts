/**
 * Model Types and Constants
 *
 * This file defines the Model interface and provides access to the
 * static model catalog. For the actual model data, see:
 * - /lib/models/data/featured.json (curated best models)
 * - /lib/models/data/legacy.json (older models for backwards compat)
 * - /lib/models/static-models.ts (TypeScript loader)
 */

export interface Model {
  id: string;
  name: string;
  provider: string;
  contextLength: number;
  inputCost: number; // per 1M tokens
  outputCost: number; // per 1M tokens
  category: string[];
  supportsReasoning?: boolean;
  supportsVision?: boolean;
  /** Extended thinking mode (Claude thinking, o1/o3, Gemini deep think) */
  supportsThinking?: boolean;
  /** Prompt caching support (Anthropic, Google) */
  supportsPromptCaching?: boolean;
  description?: string;
  maxCompletionTokens?: number;
  /** Tier: flagship (best), balanced (recommended), fast (speed), budget (cheap) */
  tier?: "flagship" | "balanced" | "fast" | "budget";
  /** Release date for sorting by recency */
  releaseDate?: string;
  /** Recommended use cases */
  recommendedFor?: string[];
}

// Re-export from static-models for backwards compatibility
export {
  FEATURED_MODELS as MODELS,
  FEATURED_MODELS as MODEL_CATALOG,
  ALL_STATIC_MODELS,
  LEGACY_MODELS,
  DEFAULT_MODEL,
  USE_CASE_RECOMMENDATIONS,
  getStaticModelById as getModelById,
  getFeaturedByCategory as getModelsByCategory,
  getFeaturedByTier as getModelsByTier,
  getRecommendedModels,
  CATALOG_VERSION,
} from "@/lib/models/static-models";

// Dynamic models (can be set by the store after API refresh)
let dynamicModels: Model[] | null = null;

export function setDynamicModels(models: Model[] | null) {
  dynamicModels = models;
}

export function getAllModels(): Model[] {
  // Import here to avoid circular dependency
  const { FEATURED_MODELS } = require("@/lib/models/static-models");

  if (dynamicModels && dynamicModels.length > 0) {
    return dynamicModels;
  }
  return FEATURED_MODELS;
}

/**
 * Default model ID for each provider.
 * Used during onboarding to set an appropriate default model
 * based on the provider the user selects.
 */
export const DEFAULT_MODEL_BY_PROVIDER: Record<string, string> = {
  openrouter: "google/gemini-3-flash-preview", // Universal access, best value
  openai: "openai/gpt-5-mini", // Balanced, good for agents and tool calling
  anthropic: "anthropic/claude-sonnet-4.5", // Best coding model
  google: "google/gemini-3-flash-preview", // Best value
  deepseek: "deepseek/deepseek-v3.2", // Cheapest high-quality
  mistral: "mistralai/mistral-large-3", // Open source flagship
  xai: "x-ai/grok-3", // Balanced
  groq: "meta-llama/llama-3.3-70b-instruct", // Fast open source
  together: "meta-llama/llama-3.3-70b-instruct", // Open source
  perplexity: "perplexity/sonar-pro", // Search-enhanced
};

/**
 * Get the default model ID for a given provider.
 * Falls back to the global DEFAULT_MODEL if provider is unknown.
 */
export function getDefaultModelIdForProvider(providerId: string): string {
  const { DEFAULT_MODEL } = require("@/lib/models/static-models");
  return DEFAULT_MODEL_BY_PROVIDER[providerId] || DEFAULT_MODEL.id;
}

/**
 * Default fast/cheap models per provider for background/utility tasks.
 * Each provider uses their own cheapest capable model.
 */
export const DEFAULT_UTILITY_MODEL_BY_PROVIDER: Record<string, string> = {
  openrouter: "openai/gpt-5-nano",
  openai: "openai/gpt-5-nano",
  anthropic: "anthropic/claude-3-haiku",
  google: "google/gemini-2.0-flash-001",
  groq: "meta-llama/llama-3.1-8b-instant",
  deepseek: "deepseek/deepseek-chat-v3-0324",
  mistral: "mistralai/mistral-medium-3",
  xai: "x-ai/grok-code-fast-1",
  together: "meta-llama/llama-3.3-70b-instruct",
  perplexity: "perplexity/sonar",
};

/**
 * Get the default utility model ID for a given provider (for background tasks).
 * Falls back to gpt-5-nano via openrouter if provider is unknown.
 */
export function getDefaultUtilityModelIdForProvider(providerId: string): string {
  return DEFAULT_UTILITY_MODEL_BY_PROVIDER[providerId] || "openai/gpt-5-nano";
}

// Model tiers for quick filtering
export const MODEL_TIERS = {
  get flagship() {
    const { getFeaturedByTier } = require("@/lib/models/static-models");
    return getFeaturedByTier("flagship");
  },
  get balanced() {
    const { getFeaturedByTier } = require("@/lib/models/static-models");
    return getFeaturedByTier("balanced");
  },
  get fast() {
    const { getFeaturedByTier } = require("@/lib/models/static-models");
    return getFeaturedByTier("fast");
  },
  get budget() {
    const { getFeaturedByTier } = require("@/lib/models/static-models");
    return getFeaturedByTier("budget");
  },
};
