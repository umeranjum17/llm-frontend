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
