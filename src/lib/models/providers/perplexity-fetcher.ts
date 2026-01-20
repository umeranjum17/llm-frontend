import type { Model } from "@/lib/constants/models";
import type { ProviderFetcher } from "./base-fetcher";

// Perplexity curated model list with expanded offerings
const PERPLEXITY_MODELS = [
  {
    id: "perplexity/sonar-pro",
    name: "Sonar Pro",
    contextLength: 200000,
    inputCost: 3.0,
    outputCost: 15.0,
    supportsVision: true,
    supportsReasoning: true,
    tier: "balanced",
    description: "Perplexity's flagship reasoning model with web search",
  },
  {
    id: "perplexity/llama-3.1-sonar-large-128k-online",
    name: "Llama 3.1 Sonar Large 128k Online",
    contextLength: 131072,
    inputCost: 1.0,
    outputCost: 1.0,
    tier: "balanced",
    description: "Large Sonar model with online web search capabilities",
  },
  {
    id: "perplexity/llama-3.1-sonar-small-128k-online",
    name: "Llama 3.1 Sonar Small 128k Online",
    contextLength: 131072,
    inputCost: 0.2,
    outputCost: 0.2,
    tier: "budget",
    description: "Efficient Sonar model with web search integration",
  },
];

export class PerplexityFetcher implements ProviderFetcher {
  getProviderId(): string {
    return "perplexity";
  }

  async fetchModels(apiKey?: string): Promise<Model[]> {
    // Return curated list
    return PERPLEXITY_MODELS.map((m) => ({
      ...m,
      provider: "Perplexity",
      category: m.supportsReasoning ? ["reasoning"] : [],
    })) as Model[];
  }
}
