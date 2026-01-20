/**
 * Model capabilities registry
 * Defines which parameters each model supports
 * Now uses rule engine for dynamic capability detection
 */

import { getModelById } from "@/lib/constants/models";
import { getRuleEngine } from "@/lib/models/rule-engine";
import capabilityRulesData from "@/lib/models/rules/capability-rules.json";

const capabilityRules = capabilityRulesData as any;

/**
 * Tool calling capability tiers:
 * - "none": Model doesn't support tool/function calling
 * - "basic": Supports simple single-tool calls but may struggle with complex workflows
 * - "advanced": Reliably handles multi-step tool workflows (e.g., Composio SEARCH→READ→EXECUTE)
 * - "elite": Best-in-class tool calling, top performers on OpenRouter benchmarks (Jan 2026)
 */
export type ToolCallingTier = "none" | "basic" | "advanced" | "elite";

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
  supportsExplicitCacheParameter: boolean; // OpenAI explicit cache parameter support
  supportsThinking: boolean; // Extended thinking (Claude, o1, o3, etc.)
  toolCallingTier: ToolCallingTier; // How well the model handles tool calling
}

// Cache for resolved capabilities
const capabilitiesCache = new Map<string, ModelCapabilities>();

/**
 * Elite tier: Best-in-class tool calling models based on OpenRouter rankings (Jan 2026)
 * These models consistently score at the top of t2-bench and BFCL benchmarks.
 *
 * OpenRouter Tool Calling Rankings (Jan 2026):
 * #1 Claude Opus 4.5, #2 GPT-5.2, #3 Claude Sonnet 4.5, #4 Gemini 3 Flash (90.2% t2-bench!)
 */
const ELITE_TOOL_CALLING_PATTERNS = [
  "claude-opus-4.5", "claude-sonnet-4.5",  // #1, #3 OpenRouter
  "gpt-5.2", "gpt-5.2-codex",              // #2 OpenRouter, Codex: SWE-bench Pro SOTA
  "gemini-3-flash",                         // #4 OpenRouter (exceptional t2-bench: 90.2%)
  "kimi-k2",                                // Exceptional agentic - 200-300 sequential tool calls
  "glm-4.7",                                // 90.6% tool use, 96% τ2-Bench
];

/**
 * Models known to handle complex multi-step tool workflows reliably.
 * Based on multiple benchmarks and real-world community feedback.
 *
 * Benchmark Sources (2025-2026):
 * - BFCL: Llama 3.1 405B (81.1%), Llama 3.3 70B (77.3%), GLM-4.5 (70.85%)
 * - Enterprise Tool Use (Scale.com): o1 (70.14%), o1-Pro (67.01%)
 * - τ²-Bench: MiMo-V2-Flash (95.3 Telecom, 79.5 Retail), GLM-4.7 (96% telecom)
 * - SWE-Bench Verified: MiMo-V2-Flash (73.4%), Gemini 3 Flash (78%)
 * - Cost-efficient: GPT-4o-mini ($0.15/$0.60 per 1M, user validated)
 *
 * Sources:
 * - https://gorilla.cs.berkeley.edu/leaderboard.html (BFCL)
 * - https://scale.com/leaderboard/tool_use_enterprise
 * - https://github.com/XiaomiMiMo/MiMo-V2-Flash (MiMo-V2-Flash benchmarks)
 * - User validation and production testing
 */
const ADVANCED_TOOL_CALLING_PATTERNS = [
  // Anthropic Claude - TOP TIER on BFCL (~70%)
  // Note: claude-opus-4.5 and claude-sonnet-4.5 are in elite tier
  "claude-3.5", "claude-3.6", "claude-4", "claude-sonnet-4", "claude-opus-4",

  // OpenAI o1 series - TOP of Enterprise Tool Use (o1: 70.14%, o1-Pro: 67.01%)
  "o1", "o1-pro",

  // OpenAI GPT-5 series - 98.7% Tau2-bench tool calling, leads MCPMark agentic workflows
  "gpt-5", "gpt-5.2",

  // OpenAI GPT-4o - Strong BFCL performance, resilient multi-turn tool use
  "gpt-4o",

  // xAI Grok 4.1 Fast - BFCL 72%, SOTA tool invocation, halved hallucination rate
  "grok-4.1-fast",
  // xAI Grok Code Fast 1 - Agentic by design, trained for tool calling, SWE-bench 70.8%, 92 tok/s
  "grok-code-fast-1",

  // Google Gemini - #4 Gemini 3 Flash is elite, 2.5 Flash is advanced
  "gemini-2.5-flash",

  // Zhipu GLM - TOP of BFCL (GLM-4.5: 70.85%), GLM-4.7: 90.6% tool use, τ2-Bench 96%
  "glm-4", "glm-4.5", "glm-4.7",

  // Meta Llama - Strong on BFCL (405B: 81.1%)
  "llama-3.1-405b", "llama-3.3-70b", "llama-4-405b",

  // Cohere Command A - "most performant for tool use", strong real-world feedback
  // Note: Command R+ demoted to basic (Enterprise Tool Use only 30.21%)
  "command-a-03-2025", "command-a",

  // OpenAI cost-efficient models with reliable tool calling
  "gpt-4o-mini",  // User validated: cost-efficient ($0.15/$0.60), production-ready

  // DeepSeek V3.2 - Now supports tool calls in thinking mode (Jan 2026 update)
  "deepseek-v3.2",

  // Xiaomi MiMo-V2-Flash - 73.4% SWE-Bench Verified, 95.3 τ²-Bench Telecom
  // Trained explicitly for agentic workflows (309B MoE, 15B active)
  "mimo-v2-flash",

  // Google Gemini 2.0 Flash - Enhanced function calling, $0.13/$0.5 (budget)
  "gemini-2.0-flash",
];

/**
 * Models that support tools but struggle with complex multi-step workflows.
 * May work for simple single-tool calls but unreliable for agentic patterns.
 *
 * Community Feedback Sources:
 * - GPT-4o issues: https://community.openai.com/t/gpt-4o-cannot-properly-call-custom-functions-more-than-half-the-time/754926
 * - GPT-4o-mini failures: https://community.openai.com/t/the-failure-rate-of-function-calls-of-gpt-4o-mini-is-increasing/918874
 * - DeepSeek issues: https://github.com/deepseek-ai/DeepSeek-V3/issues/826
 * - Qwen issues: https://github.com/QwenLM/Qwen3-Coder/issues/475
 * - Command R+ Enterprise Tool Use: 30.21% (Scale.com)
 */
const BASIC_TOOL_CALLING_PATTERNS = [
  // OpenAI models - Older versions with weaker tool calling
  // Note: gpt-4o, gpt-4o-mini, gpt-5 promoted to ADVANCED
  "gpt-4-turbo", "gpt-4.1", "gpt-4.5",
  "gpt-3.5",

  // OpenAI o-series reasoning models (o3, o4 only - o1/o1-pro promoted to ADVANCED)
  "o3", "o4",

  // DeepSeek - Community reports: "significant weakness", auto mode broken, random Chinese text
  // Note: V3.2 promoted to ADVANCED (now supports tool calls in thinking mode)
  "deepseek-v3", "deepseek-r1", "deepseek-reasoner",

  // Google Gemini - Mixed results, older versions
  "gemini-flash", "gemini-1.0", "gemini-1.5", "gemini-2.0", "gemini-3",

  // Anthropic older/smaller models
  "claude-instant", "claude-2", "claude-3-haiku",

  // Meta smaller Llama models
  "llama-3.1-8b", "llama-3.1-70b", "llama-3.2", "llama-4-scout", "llama-4-maverick",

  // Mistral models - Enterprise Tool Use 50.35% (below threshold)
  // Community: "struggles parallel", template issues
  "mistral-7b", "mistral-small", "mistral-medium", "mistral-large", "mixtral", "codestral",

  // Microsoft Phi models
  "phi-", "phi-3", "phi-4",

  // Alibaba Qwen - Community: "extremely unreliable" native function calling
  // Requires Qwen-Agent framework for reliable tool use
  "qwen-2.5-7b", "qwen-2.5-14b", "qwen-2.5-32b", "qwen-2.5-72b",
  "qwen-turbo", "qwen-plus", "qwen-max", "qwen-2.5-max", "qwen3-max",

  // Cohere Command R+ - Enterprise Tool Use only 30.21%
  "command-r-plus", "command-r+",

  // xAI Grok (older versions - Grok 4.1 Fast is in ADVANCED)
  "grok-2", "grok-3",

  // Other models
  "gemma", "olmo", "internlm", "yi-", "reka",
];

/**
 * Flash models that have exceptional tool calling (not downgraded to basic)
 */
const ADVANCED_FLASH_MODELS = ["gemini-3-flash", "gemini-2.5-flash", "gemini-2.0-flash", "mimo-v2-flash"];

/**
 * Mini/small models that have exceptional tool calling (not downgraded to basic)
 */
const ADVANCED_MINI_MODELS = ["gpt-4o-mini", "gpt-5-mini"];

/**
 * Determine tool calling tier based on model ID
 */
function getToolCallingTier(modelId: string, supportsTools: boolean): ToolCallingTier {
  if (!supportsTools) return "none";

  const lowerModelId = modelId.toLowerCase();

  // Check for elite tier first (best-in-class tool calling)
  if (ELITE_TOOL_CALLING_PATTERNS.some(pattern => lowerModelId.includes(pattern.toLowerCase()))) {
    return "elite";
  }

  // Check for advanced tier (order matters - check specific patterns)
  if (ADVANCED_TOOL_CALLING_PATTERNS.some(pattern => lowerModelId.includes(pattern.toLowerCase()))) {
    // Exclude mini/small variants from advanced tier, unless they're in the exception list
    // Use more specific patterns to avoid false matches (e.g., "gemini" contains "mini")
    const isMiniVariant = (lowerModelId.includes("-mini") || lowerModelId.includes("_mini") ||
                           lowerModelId.includes("-small") || lowerModelId.includes("_small"));
    if (isMiniVariant && !ADVANCED_MINI_MODELS.some(m => lowerModelId.includes(m))) {
      return "basic";
    }
    // Only downgrade flash models that aren't in the advanced flash list
    if (lowerModelId.includes("flash") && !ADVANCED_FLASH_MODELS.some(m => lowerModelId.includes(m))) {
      return "basic";
    }
    return "advanced";
  }

  // Check for basic tier
  if (BASIC_TOOL_CALLING_PATTERNS.some(pattern => lowerModelId.includes(pattern.toLowerCase()))) {
    return "basic";
  }

  // Default: if model supports tools but we don't know it, assume basic
  return "basic";
}

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
    const supportsTools = defaults.supportsTools ?? false;
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
      supportsTools,
      supportsStreaming: defaults.supportsStreaming ?? true,
      isImageGeneration: isImageGen,
      supportsPromptCaching: false,
      supportsExplicitCacheParameter: false,
      supportsThinking: false,
      toolCallingTier: getToolCallingTier(modelId, supportsTools),
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
  const supportsTools = (detected.supportsTools as boolean) ?? (defaults.supportsTools ?? false);

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
    supportsTools,
    supportsStreaming: (detected.supportsStreaming as boolean) ?? (defaults.supportsStreaming ?? true),
    isImageGeneration: isImageGen,
    // Use stable boolean flags from model data
    supportsPromptCaching: (model as any).supportsPromptCaching ?? false,
    supportsExplicitCacheParameter: (model as any).supportsExplicitCacheParameter ?? false,
    supportsThinking: (model as any).supportsThinking ?? false,
    toolCallingTier: getToolCallingTier(modelId, supportsTools),
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
  supportsExplicitCacheParameter: false,
  supportsThinking: false,
  toolCallingTier: "none",
};
