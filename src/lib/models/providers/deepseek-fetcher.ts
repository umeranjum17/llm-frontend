import type { Model } from "@/lib/constants/models";
import type { ProviderFetcher } from "./base-fetcher";

// DeepSeek curated model list matching featured.json
const DEEPSEEK_MODELS = [
  {
    id: "deepseek/deepseek-v3.2",
    name: "DeepSeek V3.2",
    contextLength: 128000,
    inputCost: 0.28,
    outputCost: 0.42,
    supportsPromptCaching: true,
    tier: "budget",
    description: "Latest DeepSeek model with improved performance",
  },
  {
    id: "deepseek/deepseek-reasoner",
    name: "DeepSeek Reasoner",
    contextLength: 128000,
    inputCost: 0.55,
    outputCost: 2.19,
    supportsReasoning: true,
    supportsThinking: true,
    supportsPromptCaching: true,
    tier: "budget",
    description: "DeepSeek model optimized for reasoning tasks",
  },
  {
    id: "deepseek/deepseek-r1",
    name: "DeepSeek R1",
    contextLength: 128000,
    inputCost: 0.55,
    outputCost: 2.19,
    supportsReasoning: true,
    supportsThinking: true,
    tier: "budget",
    description: "DeepSeek R1 reasoning model",
  },
  {
    id: "deepseek/deepseek-chat-v3-0324",
    name: "DeepSeek Chat V3",
    contextLength: 128000,
    inputCost: 0.14,
    outputCost: 0.28,
    tier: "budget",
    description: "DeepSeek Chat V3 - fast and affordable",
  },
];

export class DeepSeekFetcher implements ProviderFetcher {
  getProviderId(): string {
    return "deepseek";
  }

  async fetchModels(apiKey?: string): Promise<Model[]> {
    // Return curated list - DeepSeek context caching is automatic (90% savings)
    return DEEPSEEK_MODELS.map((m) => ({
      ...m,
      provider: "DeepSeek",
      category: m.supportsReasoning ? ["reasoning"] : ["general"],
    })) as Model[];
  }
}
