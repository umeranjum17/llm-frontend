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

// Use case recommendations based on OpenRouter rankings (Jan 2026)
export const USE_CASE_RECOMMENDATIONS: Record<string, { models: string[]; description: string }> = {
  "tool-calling": {
    models: [
      // Elite tier (best performance)
      "z-ai/glm-4.7",                     // #1 BFCL (90.6%)
      "anthropic/claude-opus-4.5",        // Elite tier, best overall
      "anthropic/claude-sonnet-4.5",      // Elite tier, balanced
      "moonshotai/kimi-k2",               // Elite tier (200-300 sequential calls)

      // Cost-efficient tier (user priority)
      "openai/gpt-5-mini",                // NEW: $0.50/$2.0, better reasoning than 4o-mini, default for agents
      "openai/gpt-4o-mini",               // PROMOTED: $0.15/$0.60, user validated
      "deepseek/deepseek-v3.2",           // PROMOTED: $0.28/$0.42, thinking mode tools
      "meta-llama/llama-3.3-70b-instruct", // ADDED: 77.3% BFCL, $0.35/$0.40
      "xiaomi/mimo-v2-flash",             // PROMOTED: 73.4% SWE-Bench, $0.1/$0.3

      // Enterprise tier
      "cohere/command-a-03-2025",         // Enterprise-grade, $2.5/$10
      "z-ai/glm-4.5",                     // #2 BFCL (70.85%)
    ],
    description: "Best for function calling and agentic workflows",
  },
  coding: {
    models: [
      "anthropic/claude-opus-4.5",      // SWE-bench 80.9% (highest)
      "openai/gpt-5.2-codex",           // SWE-bench 80.0%, HumanEval 91.7%
      "anthropic/claude-sonnet-4.5",    // SWE-bench 77.2%, great balance
      "x-ai/grok-code-fast-1",          // SWE-bench 70.8%, fastest (92 tok/s), #1 usage
      "qwen/qwen3-coder",               // #2 OpenRouter, strong tool use
    ],
    description: "Best for code generation and programming",
  },
  reasoning: {
    models: [
      "deepseek/deepseek-r1",           // Open-source o1 rival, excellent reasoning
      "anthropic/claude-sonnet-4.5",    // Strong reasoning
      "openai/o3-mini",                 // Cost-efficient reasoning
      "google/gemini-3-deep-think",     // Google reasoning flagship
      "deepseek/deepseek-reasoner",     // Budget reasoning with thinking
    ],
    description: "Complex problem-solving and multi-step reasoning",
  },
  chat: {
    models: ["google/gemini-3-flash-preview", "openai/gpt-5.2", "anthropic/claude-haiku-4", "deepseek/deepseek-v3.2"],
    description: "Fast, natural conversation",
  },
  budget: {
    models: ["deepseek/deepseek-r1", "deepseek/deepseek-v3.2", "xiaomi/mimo-v2-flash", "z-ai/glm-4.5", "meta-llama/llama-4-scout"],
    description: "Maximum value for cost-sensitive applications",
  },
  creative: {
    models: ["openai/gpt-5.2", "anthropic/claude-sonnet-4.5", "google/gemini-3-pro", "openai/gpt-5-image"],
    description: "Creative writing, brainstorming, and ideation",
  },
  research: {
    models: ["perplexity/sonar-pro", "openai/gpt-5.2", "google/gemini-3-pro", "anthropic/claude-opus-4.5"],
    description: "Research, analysis, and information synthesis",
  },
  vision: {
    models: [
      "x-ai/grok-4",                           // Best visual reasoning
      "openai/gpt-5.2",                        // Excellent multimodal
      "google/gemini-3-pro",                   // 1M context, strong vision
      "meta-llama/llama-3.2-90b-vision-instruct", // Top-tier vision model
      "qwen/qwen2.5-vl-72b-instruct",          // Document/chart specialist
      "anthropic/claude-opus-4.5",             // Great all-around
      "meta-llama/llama-4-maverick",           // Budget multimodal
      "google/gemma-3-27b-it",                 // Open source vision
      "z-ai/glm-4.6v-9b",                      // Fast & lightweight
    ],
    description: "Image understanding, visual reasoning, and document analysis",
  },
  agents: {
    models: [
      // Elite agentic models
      "z-ai/glm-4.7",                     // Best-in-class agentic
      "moonshotai/kimi-k2",               // 200-300 sequential calls
      "anthropic/claude-sonnet-4.5",      // Excellent agentic workflows

      // Cost-efficient agentic models (NEW PRIORITY)
      "openai/gpt-4o-mini",               // ADDED: Budget agents, $0.15/$0.60
      "xiaomi/mimo-v2-flash",             // PROMOTED: Fast agentic, $0.1/$0.3
      "deepseek/deepseek-v3.2",           // ADDED: Budget thinking + tools, $0.28/$0.42
      "meta-llama/llama-3.3-70b-instruct", // ADDED: Open-source, $0.35/$0.40

      // Enterprise agentic
      "cohere/command-a-03-2025",         // Enterprise RAG + tools
      "anthropic/claude-opus-4.5",        // Flagship agentic
    ],
    description: "Best for autonomous agent workflows",
  },
  "budget-agents": {
    models: [
      "openai/gpt-4o-mini",               // $0.15/$0.60 - best value
      "xiaomi/mimo-v2-flash",             // $0.1/$0.3 - fast agentic
      "deepseek/deepseek-v3.2",           // $0.28/$0.42 - thinking mode tools
      "meta-llama/llama-3.3-70b-instruct", // $0.35/$0.40 - open-source
      "z-ai/glm-4.5",                     // $0.5/$2.0 - #1 BFCL budget option
    ],
    description: "Cost-efficient models with excellent tool calling for high-volume agentic workflows",
  },
  "long-context": {
    models: ["meta-llama/llama-4-scout", "google/gemini-3-pro", "google/gemini-3-flash-preview", "openai/gpt-5.2"],
    description: "Processing very long documents or codebases",
  },
  "image-generation": {
    models: [
      "black-forest-labs/flux.2-max",          // Best quality
      "google/gemini-2.5-flash-image", // Nano Banana GA - great text rendering
      "openai/gpt-5-image",                    // Native multimodal
      "black-forest-labs/flux.2-pro",          // Professional quality
      "black-forest-labs/flux.2-flex",         // Text & multi-reference
      "openai/gpt-5-image-mini",               // Budget option
      "openai/dall-e-3",                       // Reliable classic
      "black-forest-labs/flux.2-klein-4b",     // Fast & cheap
    ],
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
