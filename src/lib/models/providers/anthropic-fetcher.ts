import type { Model } from "@/lib/constants/models";
import type { ProviderFetcher } from "./base-fetcher";

// Anthropic doesn't have a public models endpoint, so we maintain a curated list
// This will be enhanced with OpenRouter data when available
const ANTHROPIC_MODELS = [
  {
    id: "anthropic/claude-opus-4.5",
    name: "Claude Opus 4.5",
    contextLength: 200000,
    inputCost: 15.0,
    outputCost: 75.0,
    supportsVision: true,
    supportsReasoning: true,
  },
  {
    id: "anthropic/claude-sonnet-4.5",
    name: "Claude Sonnet 4.5",
    contextLength: 200000,
    inputCost: 3.0,
    outputCost: 15.0,
    supportsVision: true,
    supportsReasoning: false,
  },
  {
    id: "anthropic/claude-haiku-4.5",
    name: "Claude Haiku 4.5",
    contextLength: 200000,
    inputCost: 0.25,
    outputCost: 1.25,
    supportsVision: true,
    supportsReasoning: false,
  },
  {
    id: "anthropic/claude-3.5-sonnet",
    name: "Claude 3.5 Sonnet",
    contextLength: 200000,
    inputCost: 3.0,
    outputCost: 15.0,
    supportsVision: true,
    supportsReasoning: false,
  },
  {
    id: "anthropic/claude-3-opus",
    name: "Claude 3 Opus",
    contextLength: 200000,
    inputCost: 15.0,
    outputCost: 75.0,
    supportsVision: true,
    supportsReasoning: false,
  },
];

export class AnthropicFetcher implements ProviderFetcher {
  getProviderId(): string {
    return "anthropic";
  }

  async fetchModels(apiKey?: string): Promise<Model[]> {
    // Anthropic doesn't expose a models endpoint
    // Return curated list - will be enhanced by OpenRouter data
    return ANTHROPIC_MODELS.map((m) => ({
      ...m,
      provider: "Anthropic",
      category: [],
      description: `${m.name} by Anthropic`,
    })) as Model[];
  }
}




