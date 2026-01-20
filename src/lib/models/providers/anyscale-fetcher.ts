import type { Model } from "@/lib/constants/models";
import type { ProviderFetcher } from "./base-fetcher";

// Anyscale curated model list
const ANYSCALE_MODELS = [
  {
    id: "anyscale/llama-3.1-70b",
    name: "Llama 3.1 70B",
    contextLength: 128000,
    inputCost: 0.88,
    outputCost: 0.88,
    tier: "balanced",
    description: "Llama 3.1 70B hosted on Anyscale",
  },
  {
    id: "anyscale/llama-3.1-8b",
    name: "Llama 3.1 8B",
    contextLength: 128000,
    inputCost: 0.15,
    outputCost: 0.15,
    tier: "budget",
    description: "Efficient Llama 3.1 8B on Anyscale infrastructure",
  },
  {
    id: "anyscale/mixtral-8x7b",
    name: "Mixtral 8x7B",
    contextLength: 32768,
    inputCost: 0.5,
    outputCost: 0.5,
    tier: "budget",
    description: "Mixtral MoE model with Anyscale optimizations",
  },
];

export class AnyscaleFetcher implements ProviderFetcher {
  getProviderId(): string {
    return "anyscale";
  }

  async fetchModels(apiKey?: string): Promise<Model[]> {
    // Return curated list
    return ANYSCALE_MODELS.map((m) => ({
      ...m,
      provider: "Anyscale",
      category: [],
    })) as Model[];
  }
}
