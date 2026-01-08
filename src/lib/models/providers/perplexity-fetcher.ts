import type { Model } from "@/lib/constants/models";
import type { ProviderFetcher } from "./base-fetcher";

// Perplexity models - curated list
const PERPLEXITY_MODELS = [
  {
    id: "perplexity/llama-3.1-sonar-large-128k-online",
    name: "Llama 3.1 Sonar Large 128k Online",
    contextLength: 131072,
    inputCost: 0.0,
    outputCost: 0.0,
    supportsVision: false,
    supportsReasoning: false,
  },
  {
    id: "perplexity/llama-3.1-sonar-small-128k-online",
    name: "Llama 3.1 Sonar Small 128k Online",
    contextLength: 131072,
    inputCost: 0.0,
    outputCost: 0.0,
    supportsVision: false,
    supportsReasoning: false,
  },
];

export class PerplexityFetcher implements ProviderFetcher {
  getProviderId(): string {
    return "perplexity";
  }

  async fetchModels(apiKey?: string): Promise<Model[]> {
    // Perplexity doesn't expose a models endpoint
    // Return curated list - will be enhanced by OpenRouter data
    return PERPLEXITY_MODELS.map((m) => ({
      ...m,
      provider: "Perplexity",
      category: [],
      description: `${m.name} by Perplexity`,
    })) as Model[];
  }
}




