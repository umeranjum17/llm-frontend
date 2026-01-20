import type { Model } from "@/lib/constants/models";
import type { ProviderFetcher } from "./base-fetcher";

// OpenRouter curated model list - comprehensive selection from featured.json
// This gives us maximum control over which models appear in the UI
const OPENROUTER_MODELS = [
  // OpenAI models via OpenRouter
  {
    id: "openai/gpt-4o",
    name: "GPT-4o",
    provider: "OpenAI",
    contextLength: 128000,
    inputCost: 2.5,
    outputCost: 10.0,
    supportsVision: true,
    tier: "balanced",
  },
  {
    id: "openai/gpt-4o-mini",
    name: "GPT-4o Mini",
    provider: "OpenAI",
    contextLength: 128000,
    inputCost: 0.15,
    outputCost: 0.6,
    supportsVision: true,
    tier: "budget",
  },
  // Anthropic models via OpenRouter
  {
    id: "anthropic/claude-opus-4.5",
    name: "Claude Opus 4.5",
    provider: "Anthropic",
    contextLength: 200000,
    inputCost: 15.0,
    outputCost: 75.0,
    supportsVision: true,
    supportsReasoning: true,
    tier: "flagship",
  },
  {
    id: "anthropic/claude-sonnet-4.5",
    name: "Claude Sonnet 4.5",
    provider: "Anthropic",
    contextLength: 200000,
    inputCost: 3.0,
    outputCost: 15.0,
    supportsVision: true,
    tier: "balanced",
  },
  {
    id: "anthropic/claude-haiku-4.5",
    name: "Claude Haiku 4.5",
    provider: "Anthropic",
    contextLength: 200000,
    inputCost: 0.25,
    outputCost: 1.25,
    supportsVision: true,
    tier: "budget",
  },
  // Google models via OpenRouter
  {
    id: "google/gemini-3-pro",
    name: "Gemini 3 Pro",
    provider: "Google",
    contextLength: 1000000,
    inputCost: 1.25,
    outputCost: 5.0,
    supportsVision: true,
    supportsReasoning: true,
    tier: "flagship",
  },
  {
    id: "google/gemini-3-flash",
    name: "Gemini 3 Flash",
    provider: "Google",
    contextLength: 1000000,
    inputCost: 0.075,
    outputCost: 0.3,
    supportsVision: true,
    tier: "fast",
  },
  // Meta Llama models
  {
    id: "meta-llama/llama-3.3-70b",
    name: "Llama 3.3 70B",
    provider: "Meta",
    contextLength: 128000,
    inputCost: 0.59,
    outputCost: 0.79,
    tier: "balanced",
  },
  // DeepSeek models
  {
    id: "deepseek/deepseek-v3.2",
    name: "DeepSeek V3.2",
    provider: "DeepSeek",
    contextLength: 128000,
    inputCost: 0.28,
    outputCost: 0.42,
    supportsPromptCaching: true,
    tier: "budget",
  },
  {
    id: "deepseek/deepseek-reasoner",
    name: "DeepSeek Reasoner",
    provider: "DeepSeek",
    contextLength: 128000,
    inputCost: 0.55,
    outputCost: 2.19,
    supportsReasoning: true,
    supportsThinking: true,
    tier: "budget",
  },
  // xAI models
  {
    id: "x-ai/grok-4",
    name: "Grok 4",
    provider: "xAI",
    contextLength: 131072,
    inputCost: 5.0,
    outputCost: 15.0,
    supportsReasoning: true,
    supportsVision: true,
    tier: "flagship",
  },
  // Mistral models
  {
    id: "mistralai/mistral-large-3",
    name: "Mistral Large 3",
    provider: "Mistral",
    contextLength: 128000,
    inputCost: 0.5,
    outputCost: 1.5,
    supportsVision: true,
    tier: "balanced",
  },
];

export class OpenRouterFetcher implements ProviderFetcher {
  getProviderId(): string {
    return "openrouter";
  }

  async fetchModels(apiKey?: string): Promise<Model[]> {
    // Return curated list for maximum control and consistency
    return OPENROUTER_MODELS.map((m) => ({
      ...m,
      category: m.supportsReasoning ? ["reasoning"] : [],
      description: `${m.name} via OpenRouter`,
    })) as Model[];
  }
}
