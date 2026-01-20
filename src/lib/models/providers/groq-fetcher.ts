import type { Model } from "@/lib/constants/models";
import type { ProviderFetcher } from "./base-fetcher";

// Groq curated model list - known for ultra-fast inference
const GROQ_MODELS = [
  {
    id: "groq/llama-3.3-70b",
    name: "Llama 3.3 70B",
    contextLength: 128000,
    inputCost: 0.59,
    outputCost: 0.79,
    tier: "balanced",
    description: "Meta's Llama 3.3 with blazing-fast Groq inference",
  },
  {
    id: "groq/llama-3.1-70b",
    name: "Llama 3.1 70B",
    contextLength: 128000,
    inputCost: 0.59,
    outputCost: 0.79,
    tier: "balanced",
    description: "Llama 3.1 70B optimized for speed on Groq LPU",
  },
  {
    id: "groq/llama-3.1-8b",
    name: "Llama 3.1 8B",
    contextLength: 128000,
    inputCost: 0.05,
    outputCost: 0.08,
    tier: "budget",
    description: "Compact and efficient Llama 3.1 with ultra-low latency",
  },
  {
    id: "groq/mixtral-8x7b",
    name: "Mixtral 8x7B",
    contextLength: 32768,
    inputCost: 0.24,
    outputCost: 0.24,
    tier: "budget",
    description: "Mistral's MoE model with exceptional speed",
  },
  {
    id: "groq/gemma-2-9b",
    name: "Gemma 2 9B",
    contextLength: 8192,
    inputCost: 0.2,
    outputCost: 0.2,
    tier: "fast",
    description: "Google's Gemma 2 with near-instant responses",
  },
];

export class GroqFetcher implements ProviderFetcher {
  getProviderId(): string {
    return "groq";
  }

  async fetchModels(apiKey?: string): Promise<Model[]> {
    // Return curated list - Groq supports automatic caching
    return GROQ_MODELS.map((m) => ({
      ...m,
      provider: "Groq",
      category: ["fast"],
      supportsPromptCaching: true, // Groq has automatic caching
    })) as Model[];
  }
}
