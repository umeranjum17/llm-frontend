import type { Model } from "@/lib/constants/models";
import type { ProviderFetcher } from "./base-fetcher";

// Together AI curated model list - quality open-source models
const TOGETHER_MODELS = [
  {
    id: "together/llama-3.3-70b",
    name: "Llama 3.3 70B",
    contextLength: 128000,
    inputCost: 0.88,
    outputCost: 0.88,
    tier: "balanced",
    description: "Meta's latest Llama model on Together AI",
  },
  {
    id: "together/qwen-2.5-72b",
    name: "Qwen 2.5 72B",
    contextLength: 32768,
    inputCost: 0.88,
    outputCost: 0.88,
    tier: "balanced",
    description: "Alibaba's powerful multilingual model",
  },
  {
    id: "together/mixtral-8x7b",
    name: "Mixtral 8x7B",
    contextLength: 32768,
    inputCost: 0.6,
    outputCost: 0.6,
    tier: "budget",
    description: "Mistral's efficient MoE architecture",
  },
  {
    id: "together/yi-large",
    name: "Yi Large",
    contextLength: 32768,
    inputCost: 0.8,
    outputCost: 0.8,
    tier: "balanced",
    description: "01.AI's flagship model with strong reasoning",
  },
];

export class TogetherFetcher implements ProviderFetcher {
  getProviderId(): string {
    return "together";
  }

  async fetchModels(apiKey?: string): Promise<Model[]> {
    // Return curated list
    return TOGETHER_MODELS.map((m) => ({
      ...m,
      provider: "Together AI",
      category: [],
    })) as Model[];
  }
}
