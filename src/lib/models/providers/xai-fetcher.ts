import type { Model } from "@/lib/constants/models";
import type { ProviderFetcher } from "./base-fetcher";

// xAI (Grok) curated model list matching featured.json
const XAI_MODELS = [
  {
    id: "x-ai/grok-4",
    name: "Grok 4",
    contextLength: 131072,
    inputCost: 5.0,
    outputCost: 15.0,
    supportsReasoning: true,
    supportsThinking: true,
    supportsVision: true,
    tier: "flagship",
    description: "xAI's flagship reasoning model with vision capabilities",
  },
  {
    id: "x-ai/grok-3",
    name: "Grok 3",
    contextLength: 131072,
    inputCost: 3.0,
    outputCost: 15.0,
    supportsReasoning: true,
    tier: "balanced",
    description: "Grok 3 with advanced reasoning capabilities",
  },
  {
    id: "x-ai/grok-code-fast-1",
    name: "Grok Code Fast 1",
    contextLength: 131072,
    inputCost: 0.5,
    outputCost: 1.5,
    tier: "fast",
    description: "Fast coding model optimized for quick responses",
  },
];

export class XAIFetcher implements ProviderFetcher {
  getProviderId(): string {
    return "xai";
  }

  async fetchModels(apiKey?: string): Promise<Model[]> {
    // Return curated list - xAI supports caching (90%+ hit rate, automatic)
    return XAI_MODELS.map((m) => ({
      ...m,
      provider: "xAI",
      category: m.id.includes("code") ? ["coding"] : m.supportsReasoning ? ["reasoning"] : ["general"],
    })) as Model[];
  }
}
