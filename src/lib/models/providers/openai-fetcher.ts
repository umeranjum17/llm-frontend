import type { Model } from "@/lib/constants/models";
import type { ProviderFetcher } from "./base-fetcher";

// OpenAI curated model list matching featured.json
const OPENAI_MODELS = [
  {
    id: "openai/gpt-5.2",
    name: "GPT-5.2",
    contextLength: 200000,
    inputCost: 10.0,
    outputCost: 30.0,
    supportsVision: true,
    supportsReasoning: true,
    supportsPromptCaching: true,
    supportsExplicitCacheParameter: false,
    tier: "flagship",
    description: "OpenAI's most advanced flagship model",
  },
  {
    id: "openai/gpt-5.2-pro",
    name: "GPT-5.2 Pro",
    contextLength: 200000,
    inputCost: 15.0,
    outputCost: 45.0,
    supportsVision: true,
    supportsReasoning: true,
    supportsPromptCaching: true,
    supportsExplicitCacheParameter: false,
    tier: "flagship",
    description: "Enhanced version of GPT-5.2 with extended capabilities",
  },
  {
    id: "openai/gpt-5.2-codex",
    name: "GPT-5.2 Codex",
    contextLength: 200000,
    inputCost: 8.0,
    outputCost: 24.0,
    supportsPromptCaching: true,
    supportsExplicitCacheParameter: false,
    tier: "balanced",
    description: "Specialized coding model based on GPT-5.2",
  },
  {
    id: "openai/gpt-5",
    name: "GPT-5",
    contextLength: 128000,
    inputCost: 5.0,
    outputCost: 15.0,
    supportsVision: true,
    supportsPromptCaching: true,
    supportsExplicitCacheParameter: false,
    tier: "balanced",
    description: "GPT-5 with multimodal capabilities",
  },
  {
    id: "openai/gpt-5-mini",
    name: "GPT-5 Mini",
    contextLength: 128000,
    inputCost: 0.5,
    outputCost: 1.5,
    supportsVision: true,
    supportsPromptCaching: true,
    supportsExplicitCacheParameter: false,
    tier: "budget",
    description: "Efficient and affordable GPT-5 variant",
  },
  {
    id: "openai/gpt-5-image",
    name: "GPT-5 Image",
    contextLength: 128000,
    inputCost: 7.5,
    outputCost: 22.5,
    supportsVision: true,
    supportsImageGeneration: true,
    supportsPromptCaching: true,
    supportsExplicitCacheParameter: false,
    tier: "balanced",
    description: "GPT-5 with advanced image understanding and generation",
  },
  {
    id: "openai/o4-mini",
    name: "o4-mini",
    contextLength: 128000,
    inputCost: 1.5,
    outputCost: 6.0,
    supportsReasoning: true,
    supportsThinking: true,
    supportsPromptCaching: true,
    supportsExplicitCacheParameter: false,
    tier: "budget",
    description: "Compact reasoning model with strong performance",
  },
  {
    id: "openai/o3-mini",
    name: "o3-mini",
    contextLength: 128000,
    inputCost: 1.1,
    outputCost: 4.4,
    supportsReasoning: true,
    supportsThinking: true,
    supportsPromptCaching: true,
    supportsExplicitCacheParameter: false,
    tier: "budget",
    description: "Efficient reasoning model for complex problems",
  },
  {
    id: "openai/gpt-4o",
    name: "GPT-4o",
    contextLength: 128000,
    inputCost: 2.5,
    outputCost: 10.0,
    supportsVision: true,
    supportsPromptCaching: true,
    supportsExplicitCacheParameter: true,
    tier: "balanced",
    description: "Omni model with vision and audio capabilities",
  },
  {
    id: "openai/gpt-4o-mini",
    name: "GPT-4o Mini",
    contextLength: 128000,
    inputCost: 0.15,
    outputCost: 0.6,
    supportsVision: true,
    supportsPromptCaching: true,
    supportsExplicitCacheParameter: true,
    tier: "budget",
    description: "Affordable multimodal model",
  },
  {
    id: "openai/dall-e-3",
    name: "DALL-E 3",
    contextLength: 0,
    inputCost: 40.0,
    outputCost: 0,
    supportsImageGeneration: true,
    tier: "balanced",
    description: "Advanced image generation model",
  },
];

export class OpenAIFetcher implements ProviderFetcher {
  getProviderId(): string {
    return "openai";
  }

  async fetchModels(apiKey?: string): Promise<Model[]> {
    // Return curated list - OpenAI supports prompt caching (1024+ tokens)
    return OPENAI_MODELS.map((m) => ({
      ...m,
      provider: "OpenAI",
      category: m.supportsImageGeneration
        ? ["image-generation"]
        : m.id.includes("codex")
          ? ["coding"]
          : m.supportsReasoning
            ? ["reasoning"]
            : [],
    })) as Model[];
  }
}
