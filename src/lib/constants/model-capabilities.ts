/**
 * Model capabilities registry
 * Defines which parameters each model supports
 * Now uses rule engine for dynamic capability detection
 */

import { getModelById } from "@/lib/constants/models";
import { getRuleEngine } from "@/lib/models/rule-engine";
import capabilityRulesData from "@/lib/models/rules/capability-rules.json";

const capabilityRules = capabilityRulesData as any;

export interface ModelCapabilities {
  supportsSystemPrompt: boolean;
  supportsTemperature: boolean;
  maxTemperature: number;
  minTemperature: number;
  supportsTopP: boolean;
  supportsFrequencyPenalty: boolean;
  supportsPresencePenalty: boolean;
  supportsMaxTokens: boolean;
  supportsReasoning: boolean;
  supportsVision: boolean;
  supportsTools: boolean;
  supportsStreaming: boolean;
  isImageGeneration: boolean;
  // Advanced features
  supportsPromptCaching: boolean; // Anthropic prompt caching
  supportsThinking: boolean; // Extended thinking (Claude, o1, o3, etc.)
}

// Cache for resolved capabilities
const capabilitiesCache = new Map<string, ModelCapabilities>();

/**
 * Get model capabilities using rule engine
 */
export function getModelCapabilities(modelId: string): ModelCapabilities {
  // Check cache but always recalculate isImageGeneration
  if (capabilitiesCache.has(modelId)) {
    const cached = capabilitiesCache.get(modelId)!;
    // Always use fresh image detection check
    return { ...cached, isImageGeneration: isImageGenerationModel(modelId) };
  }

  const model = getModelById(modelId);
  if (!model) {
    // Return defaults if model not found
    const defaults = capabilityRules.defaults;
    // Check if this is an image generation model by ID pattern
    const isImageGen = isImageGenerationModel(modelId);
    return {
      supportsSystemPrompt: defaults.supportsSystemPrompt,
      supportsTemperature: defaults.supportsTemperature,
      maxTemperature: defaults.maxTemperature,
      minTemperature: defaults.minTemperature,
      supportsTopP: defaults.supportsTopP,
      supportsFrequencyPenalty: defaults.supportsFrequencyPenalty,
      supportsPresencePenalty: defaults.supportsPresencePenalty,
      supportsMaxTokens: defaults.supportsMaxTokens,
      supportsReasoning: false,
      supportsVision: false,
      supportsTools: defaults.supportsTools ?? false,
      supportsStreaming: defaults.supportsStreaming ?? true,
      isImageGeneration: isImageGen,
      supportsPromptCaching: false,
      supportsThinking: false,
    };
  }

  // Extract provider from model ID or provider field
  const provider = model.provider.toLowerCase();
  const ruleEngine = getRuleEngine();
  const detected = ruleEngine.detectCapabilities(model, provider);

  // Get provider defaults
  const providerDefaults = capabilityRules.providerDefaults[provider as keyof typeof capabilityRules.providerDefaults] || {};
  const defaults = { ...capabilityRules.defaults, ...providerDefaults };

  // Build capabilities object
  const isImageGen = isImageGenerationModel(modelId);

  const capabilities: ModelCapabilities = {
    supportsSystemPrompt: (detected.supportsSystemPrompt as boolean) ?? defaults.supportsSystemPrompt,
    supportsTemperature: (detected.supportsTemperature as boolean) ?? defaults.supportsTemperature,
    maxTemperature: (detected.maxTemperature as number) ?? defaults.maxTemperature,
    minTemperature: defaults.minTemperature,
    supportsTopP: (detected.supportsTopP as boolean) ?? defaults.supportsTopP,
    supportsFrequencyPenalty: (detected.supportsFrequencyPenalty as boolean) ?? defaults.supportsFrequencyPenalty,
    supportsPresencePenalty: (detected.supportsPresencePenalty as boolean) ?? defaults.supportsPresencePenalty,
    supportsMaxTokens: (detected.supportsMaxTokens as boolean) ?? defaults.supportsMaxTokens,
    supportsReasoning: (detected.supportsReasoning as boolean) ?? (model.supportsReasoning ?? false),
    supportsVision: (detected.supportsVision as boolean) ?? (model.supportsVision ?? false),
    supportsTools: (detected.supportsTools as boolean) ?? (defaults.supportsTools ?? false),
    supportsStreaming: (detected.supportsStreaming as boolean) ?? (defaults.supportsStreaming ?? true),
    isImageGeneration: isImageGen,
    // Use stable boolean flags from model data
    supportsPromptCaching: (model as any).supportsPromptCaching ?? false,
    supportsThinking: (model as any).supportsThinking ?? false,
  };

  // Cache the result
  capabilitiesCache.set(modelId, capabilities);
  return capabilities;
}

/**
 * Check if a model ID is for image generation
 */
export function isImageGenerationModel(modelId: string): boolean {
  const lowerModelId = modelId.toLowerCase();

  // Check ID patterns for known image generation models
  const imagePatterns = [
    "dall-e",
    "dalle",
    "gpt-image",
    "gpt-5-image",   // OpenAI GPT-5 Image models
    "gpt-s",
    "stable-diffusion",
    "sdxl",
    "midjourney",
    "imagen",
    "flux",
    "ideogram",
    // Gemini image generation models
    "gemini-2.5-flash-image",
    "gemini-3-pro-image",
    "-image-preview",  // Catches preview variants
  ];

  if (imagePatterns.some((pattern) => lowerModelId.includes(pattern))) {
    return true;
  }

  // Also check the model's category from dynamic data
  const model = getModelById(modelId);
  if (model?.category?.includes("image-generation")) {
    return true;
  }

  return false;
}

// Default capabilities for unknown models (kept for backward compatibility)
export const DEFAULT_CAPABILITIES: ModelCapabilities = {
  supportsSystemPrompt: true,
  supportsTemperature: true,
  maxTemperature: 2.0,
  minTemperature: 0.0,
  supportsTopP: true,
  supportsFrequencyPenalty: false,
  supportsPresencePenalty: false,
  supportsMaxTokens: true,
  supportsReasoning: false,
  supportsVision: false,
  supportsTools: false,
  supportsStreaming: true,
  isImageGeneration: false,
  supportsPromptCaching: false,
  supportsThinking: false,
};
